# Git History Sidebar

A DeepSeek Harness Web plugin: the right Sidebar gains a **Git history** tab that
lists the current Session workspace's commits and opens any commit with its
message, changed files, and diff.

## What it adds

- **A tab type** — `git-history` (`@local/dsh-plugin-git-history`), opened from
  the right Sidebar's add/guide page or from the compact graph button in the
  conversation header's right-side utility row. The panel expands when the tab
  is opened.
- **A repository state panel** — above the commit list: the current branch (or
  `HEAD @ <sha>` when detached) with its upstream and `↑ahead`/`↓behind`
  counters, then the working tree grouped into *Staged*, *Changes*
  (unstaged), *Untracked*, and *Conflicts* with a status letter and path per
  row, plus the stash count. Every group is always listed with its count (0
  included), so an empty `Changes` list is visible as such; the panel is
  collapsible, keeps a one-line summary in its header, reads `Working tree
  clean` when nothing is pending, and re-reads `git status` when the window
  regains focus (the toolbar refresh also reloads it).
- **A commit list** — newest first, 50 per page with *Load more*, showing the
  short hash, refs (`HEAD -> main`, tags, remotes), subject, author, and date.
- **A commit view** — full subject and body, author/committer/date, clickable
  parent hashes, and a **changed-files panel**: one selectable row per file with
  its status letter and `+N −M` counts. Selecting a row shows that file's diff
  in place, and previous/next controls step through the files in order, so a
  commit is read file by file instead of as one long stack. Binary files and
  oversized diffs are labelled rather than rendered.

## Data flow

Both halves live in this package.

- **Host half** (`index.js`, `git.js`) registers three exact Fetch routes inside
  the Harness Connection authentication fence:

  | Route | Answer |
  |---|---|
  | `GET /api/git-history.commits?sessionId=…&limit=…&skip=…` | repository root, branch, head, one page of commits, `hasMore` |
  | `GET /api/git-history.commit?sessionId=…&hash=…` | commit metadata, changed files, per-file diff blocks, truncation flag |
  | `GET /api/git-history.status?sessionId=…` | branch/upstream/ahead-behind, staged, unstaged, untracked, conflicted paths, stash count |

  The repository directory is resolved from the Session's durable header
  (`ctx.sessionQuery.readSession`), never from a browser-supplied path, so the
  browser cannot point Git at an arbitrary directory. Git runs as argv through
  `ctx.subprocess` (no shell), and only query subcommands are used:
  `rev-parse`, `log`, `show`, `status`, `stash list` — none of them changes
  history, the index content, or the working tree (`status` may refresh the
  index's stat cache). Commit ids are validated as hexadecimal before they reach
  argv.
- **Browser half** (`client.js`) registers the tab type through
  `ctx.sidebarRightTabs`, the body under `sidebar.right.pane.tab`, the chip title
  under `sidebar.right.pane.tab.title`, a guide entry, and the header trigger
  under `conversation.session.header.utilities`. It reads the routes with
  same-origin `fetch` (the browser cookie authenticates them) and keeps every
  string in the `gitHistory` locale namespace (`en`/`zh`).

The tab appears only while a Session is selected, because the right Sidebar is
per-Session. A workspace outside any Git repository, or a commit that no longer
exists, renders a plain note instead of the list.

## Limits

- One page is at most 200 commits; the diff budget is 1 MiB per commit (a larger
  diff is marked truncated).
- Merge commits show their metadata and parents; Git prints no single-parent diff
  for them, so no file list is shown.
- Rename detection is Git's default; a renamed file appears once, with its old
  path in the row title.
- No configuration fields: tunables are the constants in `index.js`/`git.js`.

## Files

| File | Role |
|---|---|
| `package.json` | Bundle manifest: `dsh.bundle.patch`, `dsh.client`, locale/icon exports |
| `cordis.patch.yml` | Inserts the Host row `git-history-sidebar` |
| `index.js` | Host plugin: route registration, request validation, JSON answers |
| `git.js` | Git invocation through the subprocess seam and output parsers |
| `client.js` | Browser bundle: tab type, body, title, guide entry, header trigger |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | Original commit-graph artwork |
| `test/host.test.mjs` | Offline Host half check over a fake Connection and a real `git` |
| `test/parse.verify.mjs` | Cross-checks the diff/file parsers against `git --numstat` |

Both checks read the repository under test from `GH_TEST_REPO` (default: the
current directory), so they can run from this package directory:

```sh
GH_TEST_REPO=/path/to/some/checkout node test/host.test.mjs
GH_TEST_REPO=/path/to/some/checkout node test/parse.verify.mjs
```

## Install

The package is installed into the active profile as a bundle:

```sh
# through the Harness plugin manager, not by editing the profile
plugin_manager install_bundle target=/absolute/path/to/this/package
```

`install_bundle` links this directory into
`$DSH_PROFILE_DIR/node_modules` and appends the bundle layer, so a later edit of
`client.js` requires a page reload; replacing an installed package requires a
Harness restart to load a fresh JavaScript module generation.
