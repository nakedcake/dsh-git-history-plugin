/**
 * Read-only Git queries and output parsers behind the Git History sidebar tab.
 *
 * Every command runs through the Harness subprocess seam with an argv array and
 * no shell, so a branch name or a commit subject can never become a command. The
 * parsers are pure functions over captured stdout: the route handlers stay thin
 * and the formats can be tested without a running Harness.
 * @module @local/dsh-plugin-git-history/git
 */

/** Field separator inside one formatted Git record (ASCII unit separator). */
const FIELD = '\x1f'
/** Record separator between formatted Git records (ASCII record separator). */
const RECORD = '\x1e'
/** Bytes kept from one stderr stream; only the diagnostic line is used. */
const STDERR_BYTES = 64 * 1024
/** Grace period Git gets after a cancellation before the provider escalates. */
const GRACE_MS = 5000

/** Byte budgets per query: one browser page never needs more. */
export const READ_BUDGET = Object.freeze({
  probe: 256 * 1024,
  log: 4 * 1024 * 1024,
  nameStatus: 1024 * 1024,
  patch: 1024 * 1024,
  status: 2 * 1024 * 1024,
})

/** Commit-list record layout captured for every row. */
export const LOG_FORMAT = [
  '%H',
  '%h',
  '%an',
  '%ae',
  '%aI',
  '%cn',
  '%cI',
  '%D',
  '%s',
].join(FIELD) + RECORD

/** One commit's complete record: the list fields, the parents, the subject, and the message body. */
export const META_FORMAT = [
  '%H',
  '%h',
  '%an',
  '%ae',
  '%aI',
  '%cn',
  '%cI',
  '%D',
  '%P',
  '%s',
  '%B',
].join(FIELD) + RECORD

/** A read-only Git failure the route turns into a user-visible message. */
export class GitError extends Error {
  /**
   * @param {string} code - stable machine-readable reason.
   * @param {string} message - human-readable explanation.
   */
  constructor(code, message) {
    super(message)
    this.name = 'GitError'
    this.code = code
  }
}

/** First non-empty line of a diagnostic, trimmed. */
export function firstLine(text) {
  if (typeof text !== 'string') return ''
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  return ''
}

/**
 * Run one Git command in a directory and collect its bounded output.
 * @param {object} ctx - Host context carrying the subprocess seam.
 * @param {string} directory - absolute working directory for the child.
 * @param {string[]} args - arguments after the program name.
 * @param {number} maxStdoutBytes - in-memory cap for stdout.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<{ exitCode: number | null, text: string, truncated: boolean, stderr: string }>}
 */
export async function spawnGit(ctx, directory, args, maxStdoutBytes, signal) {
  let handle
  try {
    handle = ctx.subprocess.spawn({
      argv: ['git', ...args],
      cwd: directory,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: maxStdoutBytes },
        stderr: { maxBytes: STDERR_BYTES },
      },
      graceMs: GRACE_MS,
      signal,
    })
  } catch (error) {
    throw new GitError('git-unavailable', `Git could not be started: ${messageOf(error)}`)
  }
  let outcome
  try {
    outcome = await handle.done
  } catch (error) {
    throw new GitError('git-unavailable', `Git could not be started: ${messageOf(error)}`)
  }
  const stdout = handle.collected.stdout === undefined ? undefined : handle.collected.stdout.readFrom(0)
  const stderr = handle.collected.stderr === undefined ? undefined : handle.collected.stderr.readFrom(0)
  return {
    exitCode: outcome.exitCode,
    text: stdout === undefined ? '' : stdout.text,
    truncated: stdout !== undefined && stdout.lossy === true,
    stderr: stderr === undefined ? '' : stderr.text,
  }
}

/**
 * Resolve the repository that contains the session's working directory.
 * @param {object} ctx - Host context.
 * @param {string} directory - session working directory.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<{ root: string, branch: string | undefined, head: string | undefined } | undefined>}
 *   undefined when the directory is not inside a Git repository.
 */
export async function readRepository(ctx, directory, signal) {
  const top = await spawnGit(ctx, directory, ['rev-parse', '--show-toplevel'], READ_BUDGET.probe, signal)
  if (top.exitCode !== 0) {
    if (/not a git repository/i.test(top.stderr)) return undefined
    throw new GitError('git-failed', firstLine(top.stderr) || 'Git could not resolve the repository root.')
  }
  const root = top.text.trim()
  if (root.length === 0) return undefined
  const head = await spawnGit(ctx, root, ['rev-parse', '--short', 'HEAD'], READ_BUDGET.probe, signal)
  const branch = await spawnGit(ctx, root, ['rev-parse', '--abbrev-ref', 'HEAD'], READ_BUDGET.probe, signal)
  const branchName = branch.exitCode === 0 ? branch.text.trim() : ''
  return {
    root,
    branch: branchName === '' || branchName === 'HEAD' ? undefined : branchName,
    head: head.exitCode === 0 ? head.text.trim() || undefined : undefined,
  }
}

/**
 * List one page of first-parent-independent `git log` rows, newest first.
 * @param {object} ctx - Host context.
 * @param {{ root: string }} repository - resolved repository.
 * @param {{ limit: number, skip: number }} page - page window.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<{ commits: object[], hasMore: boolean }>}
 */
export async function listCommits(ctx, repository, page, signal) {
  const result = await spawnGit(
    ctx,
    repository.root,
    ['log', `--max-count=${page.limit + 1}`, `--skip=${page.skip}`, `--date=iso-strict`, `--format=${LOG_FORMAT}`],
    READ_BUDGET.log,
    signal,
  )
  if (result.exitCode !== 0) {
    if (/does not have any commits yet|unknown revision|bad revision/i.test(result.stderr)) {
      return { commits: [], hasMore: false }
    }
    throw new GitError('git-failed', firstLine(result.stderr) || 'Git could not read the commit log.')
  }
  const commits = parseLog(result.text)
  const hasMore = commits.length > page.limit
  const pageCommits = hasMore ? commits.slice(0, page.limit) : commits
  const stats = await readCommitStats(ctx, repository, page, signal)
  return {
    commits: pageCommits.map((commit) => {
      const entry = stats.get(commit.hash)
      return entry === undefined ? commit : { ...commit, added: entry.added, removed: entry.removed }
    }),
    hasMore,
  }
}

/**
 * Read per-commit `+added/−removed` line counts for one page.
 *
 * `git log --shortstat` prints one compact summary line per commit, so the whole
 * page costs one extra Git invocation and no per-commit spawn.
 * @param {object} ctx - Host context.
 * @param {{ root: string }} repository - resolved repository.
 * @param {{ limit: number, skip: number }} page - the same page window as the log.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<Map<string, { added: number, removed: number }>>} stats by full commit id.
 */
async function readCommitStats(ctx, repository, page, signal) {
  const result = await spawnGit(
    ctx,
    repository.root,
    ['log', `--max-count=${page.limit + 1}`, `--skip=${page.skip}`, '--shortstat', `--format=${RECORD}%H`],
    READ_BUDGET.log,
    signal,
  )
  if (result.exitCode !== 0) return new Map()
  return parseShortstat(result.text)
}

/**
 * Parse one page of `git log --shortstat --format=<record>%H` output.
 * @param {string} text - captured stdout.
 * @returns {Map<string, { added: number, removed: number }>} line counts by full commit id.
 */
export function parseShortstat(text) {
  const stats = new Map()
  for (const record of text.split(RECORD)) {
    const lines = record.split('\n')
    const hash = lines[0].trim()
    if (!/^[0-9a-f]{7,40}$/i.test(hash)) continue
    const summary = lines.find((line) => /changed/.test(line) && /(insertion|deletion)/.test(line))
    const added = summary === undefined ? undefined : /(\d+) insertion/.exec(summary)
    const removed = summary === undefined ? undefined : /(\d+) deletion/.exec(summary)
    stats.set(hash, {
      added: added === undefined || added === null ? 0 : Number(added[1]),
      removed: removed === undefined || removed === null ? 0 : Number(removed[1]),
    })
  }
  return stats
}

/**
 * Read one commit: its metadata, its changed files, and its diff.
 * @param {object} ctx - Host context.
 * @param {{ root: string }} repository - resolved repository.
 * @param {string} hash - validated hexadecimal commit id.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<object>} commit detail payload.
 */
export async function readCommit(ctx, repository, hash, signal) {
  const meta = await spawnGit(
    ctx,
    repository.root,
    ['show', '-s', '--date=iso-strict', `--format=${META_FORMAT}`, hash],
    READ_BUDGET.probe,
    signal,
  )
  if (meta.exitCode !== 0) {
    throw new GitError('commit-not-found', firstLine(meta.stderr) || `Commit ${hash} is not available.`)
  }
  const commit = parseMeta(meta.text)
  if (commit === undefined) {
    throw new GitError('commit-not-found', `Commit ${hash} has no readable record.`)
  }
  const status = await spawnGit(
    ctx,
    repository.root,
    ['show', '--name-status', '-z', '--format=', hash],
    READ_BUDGET.nameStatus,
    signal,
  )
  const files = status.exitCode === 0 ? parseNameStatus(status.text) : []
  const patch = await spawnGit(
    ctx,
    repository.root,
    ['show', '--patch', '--no-color', '--unified=3', '--format=', hash],
    READ_BUDGET.patch,
    signal,
  )
  const blocks = patch.exitCode === 0 ? parsePatch(patch.text) : []
  return {
    commit,
    files: attachStats(files, blocks),
    patch: blocks,
    truncated: patch.exitCode === 0 && patch.truncated === true,
    merge: commit.parents.length > 1,
  }
}

/** Unmerged porcelain-v1 status pairs. */
const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/**
 * Parse the porcelain-v1 `## …` branch header.
 * @param {string | undefined} header - header text after `## `, when present.
 * @returns {{ name: string | undefined, upstream: string | undefined, ahead: number, behind: number, detached: boolean }}
 */
export function parseBranchTracking(header) {
  const info = { name: undefined, upstream: undefined, ahead: 0, behind: 0, detached: false }
  if (typeof header !== 'string' || header.length === 0) return info
  if (header === 'HEAD (no branch)') {
    info.detached = true
    return info
  }
  const unborn = /^No commits yet on (.+)$/.exec(header)
  if (unborn !== null) {
    info.name = unborn[1]
    return info
  }
  let rest = header
  const bracket = /\[([^\]]*)\]$/.exec(rest)
  if (bracket !== null) {
    const tracking = bracket[1]
    rest = rest.slice(0, bracket.index).trim()
    const ahead = /ahead (\d+)/.exec(tracking)
    const behind = /behind (\d+)/.exec(tracking)
    if (ahead !== null) info.ahead = Number(ahead[1])
    if (behind !== null) info.behind = Number(behind[1])
  }
  const dots = rest.indexOf('...')
  if (dots === -1) {
    info.name = rest
  } else {
    info.name = rest.slice(0, dots)
    info.upstream = rest.slice(dots + 3)
  }
  return info
}

/**
 * Parse `git status --porcelain=v1 -z --branch` output into the working-tree
 * view the sidebar shows: branch tracking, staged, unstaged, untracked, and
 * conflicted paths. A path that is both staged and modified again appears in
 * both lists, exactly as Git reports it.
 * @param {string} text - NUL-separated status output.
 * @returns {object} parsed state with per-group counts.
 */
export function parseWorktreeStatus(text) {
  const tokens = text.split('\0')
  let branch = parseBranchTracking(undefined)
  const staged = []
  const unstaged = []
  const untracked = []
  const conflicts = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    index += 1
    if (token.length === 0) continue
    if (token.startsWith('## ')) {
      branch = parseBranchTracking(token.slice(3))
      continue
    }
    if (token.length < 3) continue
    const indexStatus = token[0]
    const worktreeStatus = token[1]
    const path = token.slice(3)
    let oldPath
    if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
      const original = tokens[index]
      if (original !== undefined && original.length > 0) {
        oldPath = original
        index += 1
      }
    }
    if (indexStatus === '?' && worktreeStatus === '?') {
      untracked.push({ path })
      continue
    }
    if (indexStatus === '!' && worktreeStatus === '!') continue
    if (CONFLICT_PAIRS.has(`${indexStatus}${worktreeStatus}`)) {
      conflicts.push({ path, status: 'conflict' })
      continue
    }
    if (indexStatus !== ' ') staged.push({ path, status: STATUS_NAMES[indexStatus] ?? 'modified', oldPath })
    if (worktreeStatus !== ' ') unstaged.push({ path, status: STATUS_NAMES[worktreeStatus] ?? 'modified', oldPath })
  }
  return {
    branch,
    staged,
    unstaged,
    untracked,
    conflicts,
    counts: {
      staged: staged.length,
      unstaged: unstaged.length,
      untracked: untracked.length,
      conflicts: conflicts.length,
    },
  }
}

/**
 * Read the working-tree state of the session's repository, including how many
 * stashes it holds.
 * @param {object} ctx - Host context.
 * @param {{ root: string }} repository - resolved repository.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<object>} the parsed working-tree state.
 */
export async function readWorktreeState(ctx, repository, signal) {
  const status = await spawnGit(
    ctx,
    repository.root,
    ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=normal'],
    READ_BUDGET.status,
    signal,
  )
  if (status.exitCode !== 0) {
    throw new GitError('git-failed', firstLine(status.stderr) || 'Git could not read the working-tree status.')
  }
  const parsed = parseWorktreeStatus(status.text)
  const stash = await spawnGit(ctx, repository.root, ['stash', 'list', '--format=%H'], READ_BUDGET.probe, signal)
  const stashes = stash.exitCode === 0 ? stash.text.split('\n').filter((line) => line.trim().length > 0).length : 0
  return { ...parsed, stashes }
}

/** Split formatted Git output into raw field arrays, dropping separator-only records. */
function recordsOf(text) {
  const records = []
  for (const record of text.split(RECORD)) {
    const trimmed = record.replace(/^\n+/, '')
    if (trimmed.trim().length === 0) continue
    records.push(trimmed.split(FIELD))
  }
  return records
}

/** Split Git's comma-separated decoration list into individual ref labels. */
function splitRefs(decorations) {
  if (typeof decorations !== 'string' || decorations.length === 0) return []
  return decorations
    .split(', ')
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0)
}

/**
 * Parse `git log` output captured with {@link LOG_FORMAT}.
 * @param {string} text - captured stdout.
 * @returns {object[]} commits in log order.
 */
export function parseLog(text) {
  const commits = []
  for (const fields of recordsOf(text)) {
    if (fields.length < 9) continue
    commits.push({
      hash: fields[0],
      short: fields[1],
      author: fields[2],
      authorEmail: fields[3],
      authorDate: fields[4],
      committer: fields[5],
      committerDate: fields[6],
      refs: splitRefs(fields[7]),
      subject: fields[8],
    })
  }
  return commits
}

/**
 * Parse `git show -s` output captured with {@link META_FORMAT}.
 * @param {string} text - captured stdout.
 * @returns {object | undefined} the commit record, undefined when unreadable.
 */
export function parseMeta(text) {
  const records = recordsOf(text)
  if (records.length === 0) return undefined
  const fields = records[0]
  if (fields.length < 11) return undefined
  const parents = fields[8]
    .split(' ')
    .map((parent) => parent.trim())
    .filter((parent) => parent.length > 0)
  return {
    hash: fields[0],
    short: fields[1],
    author: fields[2],
    authorEmail: fields[3],
    authorDate: fields[4],
    committer: fields[5],
    committerDate: fields[6],
    refs: splitRefs(fields[7]),
    parents,
    subject: fields[9],
    body: fields[10].replace(/^\n+/, '').replace(/\s+$/, ''),
  }
}

/** Status names for the letters `git show --name-status` prints. */
const STATUS_NAMES = Object.freeze({
  A: 'added',
  C: 'copied',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  T: 'modified',
  U: 'modified',
  X: 'modified',
  B: 'modified',
})

/** One `--name-status -z` field: the status letter and an optional similarity score. */
const STATUS_TOKEN = /^([ACDMRTUXB])\d{0,3}$/

/**
 * Parse one commit's `--name-status -z` output.
 * @param {string} text - captured stdout.
 * @returns {{ path: string, oldPath?: string, status: string }[]} changed files.
 */
export function parseNameStatus(text) {
  const tokens = text.split('\0')
  const files = []
  let index = 0
  while (index < tokens.length) {
    const statusToken = tokens[index].replace(/^\n+/, '')
    index += 1
    if (statusToken.length === 0) continue
    const match = STATUS_TOKEN.exec(statusToken)
    if (match === null) continue
    const letter = match[1]
    if (letter === 'R' || letter === 'C') {
      const from = tokens[index] ?? ''
      const to = tokens[index + 1] ?? ''
      index += 2
      files.push({ path: to, oldPath: from, status: letter === 'R' ? 'renamed' : 'copied' })
      continue
    }
    const path = tokens[index] ?? ''
    index += 1
    files.push({ path, status: STATUS_NAMES[letter] ?? 'modified' })
  }
  return files
}

/** Strip Git's `a/` or `b/` prefix and the quoting it adds for unusual names. */
function displayPath(prefixed) {
  let path = prefixed
  if (/^[ab]\//.test(path)) path = path.slice(2)
  if (path.endsWith('\t')) path = path.slice(0, -1)
  if (path.startsWith('"') && path.endsWith('"')) {
    try {
      return JSON.parse(path)
    } catch {
      return path.slice(1, -1)
    }
  }
  return path
}

/** The new-side path from a `diff --git a/<path> b/<path>` header. */
function pathFromDiffHeader(line) {
  const marker = line.lastIndexOf(' b/')
  if (marker === -1) return ''
  return displayPath(line.slice(marker + 1))
}

/**
 * Split one commit's unified diff into per-file blocks with line counts.
 *
 * Each block keeps its header metadata out of `lines`; every line a reader
 * renders is classified so the client needs no diff grammar of its own.
 * @param {string} text - captured `git show --patch` output.
 * @returns {object[]} one block per changed file.
 */
export function parsePatch(text) {
  const blocks = []
  let current
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = {
        path: pathFromDiffHeader(line),
        status: 'modified',
        added: 0,
        removed: 0,
        binary: false,
        inHunk: false,
        lines: [],
      }
      blocks.push(current)
      continue
    }
    if (current === undefined) continue
    if (line.startsWith('@@')) {
      current.inHunk = true
      current.lines.push({ kind: 'hunk', text: line })
      continue
    }
    if (!current.inHunk) {
      if (line.startsWith('new file mode')) {
        current.status = 'added'
        continue
      }
      if (line.startsWith('deleted file mode')) {
        current.status = 'deleted'
        continue
      }
      if (line.startsWith('+++ ') && line !== '+++ /dev/null') {
        current.path = displayPath(line.slice(4))
        continue
      }
      if (line.startsWith('--- ') && line !== '--- /dev/null' && current.path === '') {
        current.path = displayPath(line.slice(4))
        continue
      }
      if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
        current.binary = true
        continue
      }
      continue
    }
    if (line.startsWith('+')) {
      current.added += 1
      current.lines.push({ kind: 'added', text: line })
      continue
    }
    if (line.startsWith('-')) {
      current.removed += 1
      current.lines.push({ kind: 'removed', text: line })
      continue
    }
    if (line.startsWith('\\ No newline')) continue
    current.lines.push({ kind: 'context', text: line })
  }
  for (const block of blocks) {
    if (block.path === '') block.path = '(unknown path)'
  }
  return blocks
}

/**
 * Merge a commit's changed-file list with the line counts the diff reports.
 * @param {object[]} files - parsed `--name-status` rows.
 * @param {object[]} blocks - parsed diff blocks.
 * @returns {object[]} files carrying `added`, `removed`, `binary`, and `patchIndex`.
 */
export function attachStats(files, blocks) {
  const index_by_path = new Map()
  for (let index = 0; index < blocks.length; index += 1) {
    index_by_path.set(blocks[index].path, index)
  }
  return files.map((file) => {
    const patchIndex = index_by_path.get(file.path)
    if (patchIndex === undefined) {
      return { ...file, added: 0, removed: 0, binary: false }
    }
    const block = blocks[patchIndex]
    return {
      ...file,
      added: block.added,
      removed: block.removed,
      binary: block.binary,
      patchIndex,
    }
  })
}

/** Human-readable message of an unknown thrown value. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
