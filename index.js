/**
 * Host half of the Git History sidebar bundle.
 *
 * Two exact Fetch routes behind Connection's authentication fence answer the
 * browser half: one page of the session workspace's commit log, and one commit
 * with its message, changed files, and diff. Both resolve the repository from
 * the Session header rather than trusting a browser-supplied path, and both run
 * only read-only Git commands through the subprocess seam.
 * @module @local/dsh-plugin-git-history
 */

import { GitError, listCommits, readCommit, readRepository, readWorktreeState } from './git.js'

/** Exact Fetch route serving one page of the commit log. */
const COMMITS_ROUTE = '/api/git-history.commits'
/** Exact Fetch route serving one commit's details. */
const COMMIT_ROUTE = '/api/git-history.commit'
/** Exact Fetch route serving the current working-tree state. */
const STATUS_ROUTE = '/api/git-history.status'
/** Page size when the browser asks for none. */
const DEFAULT_LIMIT = 50
/** Largest page a caller may ask for. */
const MAX_LIMIT = 200
/** Only hexadecimal commit ids ever reach Git's argv. */
const COMMIT_HASH = /^[0-9a-f]{4,40}$/i
/** Host services this plugin cannot work without. */
export const inject = ['connection', 'subprocess', 'sessionQuery']

/**
 * Register the two read-only routes for the lifetime of this row.
 * @param {object} ctx - Host context carrying Connection, subprocess, and session queries.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: COMMITS_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => respond(ctx, request, 'commits'),
    }),
    'git-history: commit list route',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: COMMIT_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => respond(ctx, request, 'commit'),
    }),
    'git-history: commit detail route',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: STATUS_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => respond(ctx, request, 'status'),
    }),
    'git-history: working-tree status route',
  )
}

/** One JSON response with no caching: history changes outside the browser. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** A user-visible refusal the tab renders instead of a list. */
function refusal(code, message, status = 200) {
  return json({ ok: false, code, message }, status)
}

/**
 * Answer one route request.
 * @param {object} ctx - Host context.
 * @param {Request} request - authenticated request below `/api`.
 * @param {'commits' | 'commit' | 'status'} kind - which route this is.
 * @returns {Promise<Response>} the JSON answer.
 */
async function respond(ctx, request, kind) {
  const signal = request.signal
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    if (sessionId === null || sessionId.length === 0) {
      return refusal('bad-request', 'The sessionId query parameter is required.', 400)
    }
    const directory = await sessionDirectory(ctx, sessionId)
    if (directory === undefined) {
      return refusal('no-directory', 'This session has no working directory.')
    }
    const repository = await readRepository(ctx, directory, signal)
    if (repository === undefined) {
      return refusal('not-a-repository', 'This session workspace is not inside a Git repository.')
    }
    if (kind === 'commits') {
      const limit = pageSize(url.searchParams.get('limit'))
      const skip = pageOffset(url.searchParams.get('skip'))
      const page = await listCommits(ctx, repository, { limit, skip }, signal)
      return json({ ok: true, repository, ...page })
    }
    if (kind === 'status') {
      const worktree = await readWorktreeState(ctx, repository, signal)
      return json({ ok: true, repository, ...worktree })
    }
    const hash = url.searchParams.get('hash') ?? ''
    if (!COMMIT_HASH.test(hash)) {
      return refusal('bad-request', 'The hash query parameter must be a commit id.', 400)
    }
    const detail = await readCommit(ctx, repository, hash, signal)
    return json({ ok: true, repository, ...detail })
  } catch (error) {
    if (signal.aborted) return refusal('cancelled', 'The request was cancelled.')
    if (error instanceof GitError) {
      return refusal(error.code, error.message, error.code === 'commit-not-found' ? 404 : 500)
    }
    return refusal('internal-error', error instanceof Error ? error.message : String(error), 500)
  }
}

/**
 * Resolve one Session's working directory from its durable header.
 * @param {object} ctx - Host context.
 * @param {string} sessionId - logical Session identity named by the browser.
 * @returns {Promise<string | undefined>} the absolute directory, when the Session has one.
 */
async function sessionDirectory(ctx, sessionId) {
  try {
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    return snapshot.session.cwd
  } catch {
    return undefined
  }
}

/** Clamp a requested page size to `1 .. MAX_LIMIT`. */
function pageSize(raw) {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isSafeInteger(value) || value < 1) return DEFAULT_LIMIT
  return Math.min(value, MAX_LIMIT)
}

/** Clamp a requested page offset to a non-negative safe integer. */
function pageOffset(raw) {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isSafeInteger(value) || value < 0) return 0
  return value
}
