/**
 * Offline check of the Host half: the two exact Fetch routes are captured from a
 * fake Connection, then exercised against this checkout with a subprocess adapter
 * built on `node:child_process`. Run with `node test/host.test.mjs`.
 */
import assert from 'node:assert/strict'
import { spawn as spawnProcess, execFileSync } from 'node:child_process'
import { apply } from '../index.js'
import { parseBranchTracking, parseShortstat, parseWorktreeStatus } from '../git.js'

const REPO = process.env.GH_TEST_REPO ?? process.cwd()
const HEAD = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

/** Subprocess adapter with the same collect-mode read surface the real seam offers. */
function spawnCollect(spec) {
  const child = spawnProcess(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd })
  const stdout = []
  const stderr = []
  child.stdout.on('data', (chunk) => stdout.push(chunk))
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (exitCode, terminated) => resolve({ exitCode, signal: terminated }))
  })
  const reader = (chunks) => ({
    readFrom(fromByte) {
      const bytes = Buffer.concat(chunks)
      return { text: bytes.subarray(fromByte).toString('utf8'), nextOffset: bytes.length, lossy: false }
    },
  })
  return {
    done,
    collected: { stdout: reader(stdout), stderr: reader(stderr) },
    terminate() {},
    waitForExit() {
      return Promise.resolve(true)
    },
  }
}

const routes = new Map()
const ctx = {
  effect(callback) {
    callback()
  },
  subprocess: { spawn: spawnCollect },
  connection: {
    fetch: {
      register(route) {
        assert.equal(routes.has(route.path), false, `duplicate route ${route.path}`)
        routes.set(route.path, route)
        return async () => {}
      },
    },
  },
  sessionQuery: {
    async readSession(id) {
      if (id === 'no-directory') return { session: {} }
      if (id === 'outside-repo') return { session: { cwd: '/tmp' } }
      if (id === 'unknown') throw new Error('SESSION_QUERY_SESSION_NOT_FOUND')
      return { session: { cwd: REPO } }
    },
  },
}

apply(ctx)
assert.ok(routes.has('/api/git-history.commit'), 'commit route registered')
assert.ok(routes.has('/api/git-history.commits'), 'commits route registered')
assert.ok(routes.has('/api/git-history.status'), 'status route registered')

// Per-commit diffstat parsing is checked against synthetic shortstat output.
const shortstatInput = [
  '',
  'abc1234def5678\n\n 3 files changed, 12 insertions(+), 4 deletions(-)',
  '',
  'deadbeefdeadbeef\n\n 1 file changed, 2 insertions(+)',
  '',
  '0badc0ffee123456\n\n 1 file changed',
  '',
].join('\x1e')
const shortstat = parseShortstat(shortstatInput)
assert.deepEqual(shortstat.get('abc1234def5678'), { added: 12, removed: 4 })
assert.deepEqual(shortstat.get('deadbeefdeadbeef'), { added: 2, removed: 0 })
assert.deepEqual(shortstat.get('0badc0ffee123456'), { added: 0, removed: 0 })

// Porcelain-v1 parsing is checked against a synthetic status, so the assertions do not
// depend on the checkout being dirty.
assert.deepEqual(parseBranchTracking('main'), { name: 'main', upstream: undefined, ahead: 0, behind: 0, detached: false })
assert.deepEqual(parseBranchTracking('main...origin/main'), { name: 'main', upstream: 'origin/main', ahead: 0, behind: 0, detached: false })
assert.deepEqual(parseBranchTracking('feature [ahead 3]'), { name: 'feature', upstream: undefined, ahead: 3, behind: 0, detached: false })
assert.deepEqual(parseBranchTracking('main...origin/main [ahead 2, behind 1]'), { name: 'main', upstream: 'origin/main', ahead: 2, behind: 1, detached: false })
assert.equal(parseBranchTracking('HEAD (no branch)').detached, true)
assert.equal(parseBranchTracking('No commits yet on main').name, 'main')

const syntheticStatus = [
  '## main...origin/main [ahead 2, behind 1]',
  'M  staged.txt',
  ' M changed.txt',
  'MM both.txt',
  'R  renamed-new.txt',
  'renamed-old.txt',
  '?? untracked.txt',
  'UU conflict.txt',
  '',
].join('\0')
const parsedStatus = parseWorktreeStatus(syntheticStatus)
assert.deepEqual(parsedStatus.branch, { name: 'main', upstream: 'origin/main', ahead: 2, behind: 1, detached: false })
assert.deepEqual(parsedStatus.staged, [
  { path: 'staged.txt', status: 'modified', oldPath: undefined },
  { path: 'both.txt', status: 'modified', oldPath: undefined },
  { path: 'renamed-new.txt', status: 'renamed', oldPath: 'renamed-old.txt' },
])
assert.deepEqual(parsedStatus.unstaged, [
  { path: 'changed.txt', status: 'modified', oldPath: undefined },
  { path: 'both.txt', status: 'modified', oldPath: undefined },
])
assert.deepEqual(parsedStatus.untracked, [{ path: 'untracked.txt' }])
assert.deepEqual(parsedStatus.conflicts, [{ path: 'conflict.txt', status: 'conflict' }])
assert.deepEqual(parsedStatus.counts, { staged: 3, unstaged: 2, untracked: 1, conflicts: 1 })

async function call(path, query) {
  const url = new URL(path, 'http://127.0.0.1:3080')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const route = routes.get(path)
  assert.ok(route, `route ${path} registered`)
  assert.deepEqual(route.methods, ['GET'])
  assert.equal(route.requestBody, 'buffered')
  const response = await route.fetch(new Request(url))
  return { status: response.status, body: await response.json() }
}

const page = await call('/api/git-history.commits', { sessionId: 's1', limit: '5' })
assert.equal(page.status, 200)
assert.equal(page.body.ok, true)
assert.equal(page.body.commits.length, 5, 'page size honoured')
assert.equal(page.body.hasMore, true)
assert.equal(page.body.repository.root, REPO)
assert.match(page.body.repository.head, /^[0-9a-f]{7,}$/)
assert.ok(page.body.repository.branch.length > 0)
for (const commit of page.body.commits) {
  assert.match(commit.hash, /^[0-9a-f]{40}$/)
  assert.match(commit.short, /^[0-9a-f]{7,}$/)
  assert.equal(typeof commit.subject, 'string')
  assert.equal(typeof commit.author, 'string')
  assert.ok(Array.isArray(commit.refs))
  assert.ok(Number.isFinite(Date.parse(commit.authorDate)), `parseable date ${commit.authorDate}`)
  assert.equal(typeof commit.added, 'number', 'line additions on the list row')
  assert.equal(typeof commit.removed, 'number', 'line deletions on the list row')
  assert.ok(commit.added >= 0 && commit.removed >= 0)
}
assert.match(page.body.commits[0].hash, new RegExp(`^${HEAD}$`), 'newest commit is HEAD')

const worktree = await call('/api/git-history.status', { sessionId: 's1' })
assert.equal(worktree.status, 200)
assert.equal(worktree.body.ok, true)
assert.equal(worktree.body.repository.root, REPO)
assert.equal(worktree.body.counts.staged, worktree.body.staged.length)
assert.equal(worktree.body.counts.unstaged, worktree.body.unstaged.length)
assert.equal(worktree.body.counts.untracked, worktree.body.untracked.length)
assert.equal(worktree.body.counts.conflicts, worktree.body.conflicts.length)
assert.equal(typeof worktree.body.stashes, 'number')
assert.ok(worktree.body.stashes >= 0)
assert.equal(typeof worktree.body.branch.detached, 'boolean')
for (const group of [worktree.body.staged, worktree.body.unstaged, worktree.body.untracked, worktree.body.conflicts]) {
  for (const file of group) assert.equal(typeof file.path, 'string')
}

const emptyPage = await call('/api/git-history.commits', { sessionId: 's1', limit: '9999' })
assert.equal(emptyPage.status, 200)
assert.ok(emptyPage.body.commits.length <= 200, 'page size is clamped')

const detail = await call('/api/git-history.commit', { sessionId: 's1', hash: HEAD })
assert.equal(detail.status, 200)
assert.equal(detail.body.ok, true)
assert.equal(detail.body.commit.hash, HEAD)
assert.equal(typeof detail.body.commit.body, 'string')
assert.equal(typeof detail.body.commit.subject, 'string')
assert.ok(detail.body.commit.subject.length > 0, 'detail carries the subject line')
assert.ok(detail.body.commit.body.startsWith(detail.body.commit.subject), 'body starts with the subject')
assert.ok(Array.isArray(detail.body.commit.parents))
assert.ok(Array.isArray(detail.body.files))
assert.ok(Array.isArray(detail.body.patch))
assert.equal(typeof detail.body.truncated, 'boolean')
const stats = detail.body.files.find((file) => file.patchIndex !== undefined)
if (stats !== undefined) {
  const block = detail.body.patch[stats.patchIndex]
  assert.equal(stats.path, block.path)
  const added = block.lines.filter((line) => line.kind === 'added').length
  const removed = block.lines.filter((line) => line.kind === 'removed').length
  assert.equal(stats.added, added)
  assert.equal(stats.removed, removed)
  assert.ok(block.lines.some((line) => line.kind === 'hunk'), 'hunk header kept')
}

const missing = await call('/api/git-history.commit', { sessionId: 's1', hash: 'deadbeef' })
assert.equal(missing.status, 404)
assert.equal(missing.body.code, 'commit-not-found')

const badHash = await call('/api/git-history.commit', { sessionId: 's1', hash: '--upload-pack=evil' })
assert.equal(badHash.status, 400)
assert.equal(badHash.body.code, 'bad-request')

const noDirectory = await call('/api/git-history.commits', { sessionId: 'no-directory' })
assert.equal(noDirectory.body.code, 'no-directory')

const outside = await call('/api/git-history.commits', { sessionId: 'outside-repo' })
assert.equal(outside.body.code, 'not-a-repository')

const unknownSession = await call('/api/git-history.commit', { sessionId: 'unknown', hash: HEAD })
assert.equal(unknownSession.body.code, 'no-directory')

const noSession = await call('/api/git-history.commits', {})
assert.equal(noSession.status, 400)

console.log(JSON.stringify({
  routes: [...routes.keys()],
  commits: page.body.commits.length,
  hasMore: page.body.hasMore,
  branch: page.body.repository.branch,
  files: detail.body.files.length,
  patchBlocks: detail.body.patch.length,
  status: {
    branch: worktree.body.branch.name,
    ahead: worktree.body.branch.ahead,
    behind: worktree.body.branch.behind,
    staged: worktree.body.counts.staged,
    unstaged: worktree.body.counts.unstaged,
    untracked: worktree.body.counts.untracked,
    conflicts: worktree.body.counts.conflicts,
    stashes: worktree.body.stashes,
  },
  refusals: {
    missing: missing.body.code,
    badHash: badHash.body.code,
    noDirectory: noDirectory.body.code,
    outside: outside.body.code,
    unknownSession: unknownSession.body.code,
    noSession: noSession.body.code,
  },
}, null, 2))
console.log('host test: ok')
