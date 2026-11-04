/**
 * Cross-check the patch parser against Git's own `--numstat` numbers over the
 * newest commits of this checkout. Run with `node test/parse.verify.mjs`.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { parseNameStatus, parsePatch } from '../git.js'

const REPO = process.env.GH_TEST_REPO ?? process.cwd()
const hashes = execFileSync('git', ['-C', REPO, 'rev-list', '-n', '40', 'HEAD'], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0)

let checkedCommits = 0
let checkedFiles = 0
for (const hash of hashes) {
  const numstat = execFileSync('git', ['-C', REPO, 'show', '--numstat', '--format=', hash], { encoding: 'utf8' })
  const expected = new Map()
  for (const line of numstat.split('\n')) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (match === null) continue
    // A rename prints as `{old => new}`; the new side is the path the diff block names.
    const path = match[3]
      .replace(/\{([^{}]*) => ([^{}]*)\}/g, '$2')
      .replace(/^\/+/, '')
      .replace(/\/\//g, '/')
    expected.set(path, {
      added: match[1] === '-' ? 0 : Number(match[1]),
      removed: match[2] === '-' ? 0 : Number(match[2]),
      binary: match[1] === '-',
    })
  }
  const patch = execFileSync('git', ['-C', REPO, 'show', '--patch', '--no-color', '--unified=3', '--format=', hash], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const blocks = parsePatch(patch)
  const actual = new Map(blocks.map((block) => [block.path, block]))
  assert.equal(actual.size, expected.size, `${hash}: block count ${actual.size} vs ${expected.size}`)
  for (const [path, want] of expected) {
    const block = actual.get(path)
    assert.ok(block, `${hash}: missing block for ${path}`)
    if (want.binary) {
      assert.equal(block.binary, true, `${hash}: ${path} should be binary`)
      continue
    }
    assert.equal(block.added, want.added, `${hash}: ${path} added`)
    assert.equal(block.removed, want.removed, `${hash}: ${path} removed`)
  }
  const status = execFileSync('git', ['-C', REPO, 'show', '--name-status', '-z', '--format=', hash], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const files = parseNameStatus(status)
  assert.equal(files.length, expected.size, `${hash}: name-status row count`)
  checkedCommits += 1
  checkedFiles += files.length
}

console.log(`parse verify: ${checkedCommits} commits, ${checkedFiles} files consistent with Git`)
