/**
 * Browser half of the Git History sidebar bundle.
 *
 * It contributes one right-sidebar tab type (`git-history`) with a commit list
 * and a per-commit viewer, its chip title, a guide entry, and one compact button
 * in the conversation header that opens the tab. All data comes from this
 * package's Host half over the two authenticated `/api/git-history.*` routes;
 * this module never reads Git itself and never touches another plugin's DOM.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-git-history',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Tab kind this package owns, and the identity its body registers under. */
    const KIND = 'git-history'
    const ID = '@local/dsh-plugin-git-history'
    /** Locale namespace of every visible string this module renders. */
    const NS = 'gitHistory'
    /** Host routes served by this package's Host half. */
    const COMMITS_PATH = '/api/git-history.commits'
    const COMMIT_PATH = '/api/git-history.commit'
    const STATUS_PATH = '/api/git-history.status'
    /** One page of the commit list. */
    const PAGE_SIZE = 50
    /** Monospace stack for hashes, paths, and diffs; the host defines no token for it. */
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

    /** Simplified Chinese copy, used when the GUI language is Chinese. */
    const zh = {
      'tab.title': 'Git 历史',
      'guide.title': 'Git 历史',
      'guide.description': '浏览本工作区的提交',
      'trigger.label': 'Git 历史',
      'trigger.tooltip': '显示 Git 历史',
      refresh: '刷新',
      loading: '正在读取提交…',
      'loading.detail': '正在读取提交详情…',
      'error.title': '无法读取仓库',
      'error.retry': '重试',
      'refused.not-a-repository.title': '这里不是 Git 仓库',
      'refused.not-a-repository.body': '本会话的工作目录不在任何 Git 仓库中。',
      'refused.no-directory.title': '没有工作目录',
      'refused.no-directory.body': '本会话没有可用于读取 Git 历史的工作目录。',
      'refused.other.title': '历史不可用',
      'empty.commits': '这个仓库还没有任何提交。',
      more: '加载更多',
      'more.loading': '加载中…',
      back: '全部提交',
      'detail.author': '作者',
      'detail.committed': '提交时间',
      'detail.parents': '父提交',
      'detail.files': '共 {count} 个文件变更',
      'detail.files.one': '1 个文件变更',
      'detail.merge': '这是合并提交，Git 不显示单父差异。',
      'detail.noChanges': '这个提交没有改动受跟踪的内容。',
      'detail.truncated': '差异过大，查看器只显示其中一部分。',
      'detail.binary': '二进制文件',
      'detail.emptyDiff': '没有文本差异',
      'status.loading': '正在读取仓库状态…',
      'status.unavailable': '无法读取仓库状态。',
      'status.clean': '工作区干净',
      'status.staged': '已暂存',
      'status.changed': '已修改',
      'status.untracked': '未跟踪',
      'status.conflicts': '冲突',
      'status.stashes': '{count} 个 stash',
      'status.ahead': '领先 {count}',
      'status.behind': '落后 {count}',
      'status.show': '显示仓库状态',
      'status.hide': '隐藏仓库状态',
      'detail.changedFiles': '变更文件',
      'detail.previousFile': '上一个文件',
      'detail.nextFile': '下一个文件',
      'detail.rename': '由 {path} 重命名',
      'status.added': '新增',
      'status.deleted': '删除',
      'status.modified': '修改',
      'status.renamed': '重命名',
      'status.copied': '复制',
    }

    /** English copy. */
    const en = {
      'tab.title': 'Git history',
      'guide.title': 'Git history',
      'guide.description': 'Browse commits in this workspace',
      'trigger.label': 'Git history',
      'trigger.tooltip': 'Show Git history',
      refresh: 'Refresh',
      loading: 'Reading commits…',
      'loading.detail': 'Reading the commit…',
      'error.title': 'Could not read the repository',
      'error.retry': 'Retry',
      'refused.not-a-repository.title': 'No Git repository here',
      'refused.not-a-repository.body': "This session's working directory is not inside a Git repository.",
      'refused.no-directory.title': 'No working directory',
      'refused.no-directory.body': 'This session has no working directory to read Git history from.',
      'refused.other.title': 'History unavailable',
      'empty.commits': 'This repository has no commits yet.',
      more: 'Load more',
      'more.loading': 'Loading…',
      back: 'All commits',
      'detail.author': 'Author',
      'detail.committed': 'Committed',
      'detail.parents': 'Parents',
      'detail.files': '{count} changed files',
      'detail.files.one': '1 changed file',
      'detail.merge': 'This is a merge commit; Git shows no single-parent diff for it.',
      'detail.noChanges': 'This commit does not change any tracked content.',
      'detail.truncated': 'The diff is larger than the viewer reads; only part of it is shown.',
      'detail.binary': 'Binary file',
      'detail.emptyDiff': 'No textual changes',
      'status.loading': 'Reading repository state…',
      'status.unavailable': 'Repository state unavailable.',
      'status.clean': 'Working tree clean',
      'status.staged': 'Staged',
      'status.changed': 'Changes',
      'status.untracked': 'Untracked',
      'status.conflicts': 'Conflicts',
      'status.stashes': '{count} stashes',
      'status.ahead': '{count} ahead',
      'status.behind': '{count} behind',
      'status.show': 'Show repository state',
      'status.hide': 'Hide repository state',
      'detail.changedFiles': 'Changed files',
      'detail.previousFile': 'Previous file',
      'detail.nextFile': 'Next file',
      'detail.rename': 'Renamed from {path}',
      'status.added': 'Added',
      'status.deleted': 'Deleted',
      'status.modified': 'Modified',
      'status.renamed': 'Renamed',
      'status.copied': 'Copied',
    }

    /** Tab-body styling: host tokens only, one prefixed block per plugin. */
    const BODY_STYLES = [
      '.gh-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);font-family:inherit}',
      '.gh-toolbar{display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;min-height:36px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none}',
      '.gh-repo{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px}',
      '.gh-repo-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-repo-detail{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}',
      '.gh-branch{font-family:' + MONO + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.gh-tool{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}',
      '.gh-tool:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.gh-tool:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.gh-tool:disabled{opacity:.45;cursor:default}',
      '.gh-tool svg{width:15px;height:15px}',
      '.gh-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}',
      '.gh-row{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:none;border-bottom:.5px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;padding:9px 12px;cursor:pointer}',
      '.gh-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.gh-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.gh-row-top{display:flex;align-items:center;gap:6px;min-width:0}',
      '.gh-hash{font-family:' + MONO + ';font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}',
      '.gh-ref{max-width:150px;padding:0 5px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}',
      '.gh-row-tail{margin-left:auto;display:inline-flex;align-items:center;gap:10px;flex:none}',
      '.gh-date{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}',
      '.gh-diffstat{display:inline-flex;gap:5px;flex:none;font-family:' + MONO + ';font-size:10.5px;line-height:1}',
      '.gh-stat-add{color:var(--dsw-alias-state-success-primary)}',
      '.gh-stat-del{color:var(--dsw-alias-state-error-primary)}',
      '.gh-subject{font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}',
      '.gh-author{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-note{display:flex;flex-direction:column;gap:8px;padding:18px 14px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.gh-note-title{color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px}',
      '.gh-note-body{margin:0;font-size:12px;overflow-wrap:anywhere}',
      '.gh-note-action{align-self:flex-start;margin-top:2px;height:28px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.gh-note-action:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.gh-more{display:block;width:100%;padding:10px 12px;border:none;border-bottom:.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.gh-more:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.gh-more:disabled{opacity:.45;cursor:default}',
      '.gh-detail{display:flex;flex-direction:column;height:100%;min-height:0}',
      '.gh-bar{display:flex;align-items:center;gap:8px;padding:5px 8px 5px 6px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;min-height:36px}',
      '.gh-back{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px 0 6px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;flex:none;max-width:70%}',
      '.gh-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.gh-back:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.gh-back svg{width:14px;height:14px;flex:none}',
      '.gh-back-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-detail-hash{margin-left:auto;font-family:' + MONO + ';font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-title{margin:0;padding:12px 14px 4px;font-size:14px;font-weight:600;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.gh-message{margin:0;padding:4px 14px 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}',
      '.gh-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 10px;padding:9px 14px;font-size:12px;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.gh-fact-label{color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.gh-fact-value{min-width:0;overflow-wrap:anywhere}',
      '.gh-parents{display:flex;flex-wrap:wrap;gap:4px}',
      '.gh-parent{height:20px;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-brand-primary);font-family:' + MONO + ';font-size:11px;cursor:pointer}',
      '.gh-parent:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.gh-section{display:flex;flex-direction:column;gap:6px;padding:10px 14px;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.gh-section-title{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.gh-counts{font-family:' + MONO + ';font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-files-panel{display:flex;flex-direction:column;gap:2px;max-height:180px;padding:3px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);overscroll-behavior:contain}',
      '.gh-file{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:4px 6px;border:none;border-radius:calc(var(--dsw-radius-sm,6px) - 2px);background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}',
      '.gh-file:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.gh-file[aria-current="true"]{background:var(--dsw-alias-interactive-bg-active)}',
      '.gh-file:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.gh-file-status{width:13px;flex:none;text-align:center;font-weight:700;font-size:11px}',
      '.gh-file-status-added{color:var(--dsw-alias-state-success-primary)}',
      '.gh-file-status-deleted{color:var(--dsw-alias-state-error-primary)}',
      '.gh-file-status-modified{color:var(--dsw-alias-state-warn-primary)}',
      '.gh-file-status-renamed,.gh-file-status-copied{color:var(--dsw-alias-brand-primary)}',
      '.gh-file-path{flex:1;min-width:0;font-family:' + MONO + ';font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-diff{border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.gh-diff-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-family:' + MONO + ';font-size:11px;min-width:0}',
      '.gh-diff-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gh-diff-counter{flex:none;font-family:' + MONO + ';font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-diff-nav{display:flex;align-items:center;gap:3px;flex:none}',
      '.gh-diff-step{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.gh-diff-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.gh-diff-step:disabled{opacity:.4;cursor:default}',
      '.gh-diff-step:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.gh-diff-body{margin:0;padding:6px 0;overflow-x:auto;font-family:' + MONO + ';font-size:11.5px;line-height:1.45;tab-size:4}',
      '.gh-line{display:block;white-space:pre;padding:0 14px}',
      '.gh-line-hunk{color:var(--dsw-alias-brand-primary)}',
      '.gh-line-added{color:var(--dsw-alias-state-success-primary)}',
      '.gh-line-removed{color:var(--dsw-alias-state-error-primary)}',
      '.gh-line-context{color:var(--dsw-alias-label-primary)}',
      '.gh-notice{margin:0;padding:8px 14px;font-size:11px;line-height:1.5;color:var(--dsw-alias-state-warn-primary);border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.gh-diff-empty{margin:0;padding:8px 14px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-list{display:flex;flex-direction:column;flex:1;min-height:0}',
      '.gh-state{display:flex;flex-direction:column;flex:none;border-bottom:.5px solid var(--dsw-alias-border-l1);min-height:0}',
      '.gh-state-head{display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;min-height:32px;min-width:0}',
      '.gh-state-toggle{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}',
      '.gh-state-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.gh-state-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.gh-state-branch{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:' + MONO + ';font-size:11.5px;color:var(--dsw-alias-label-primary)}',
      '.gh-state-branch svg{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.gh-state-track{display:inline-flex;gap:4px;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-state-summary{margin-left:auto;flex:none;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-state-body{display:flex;flex-direction:column;gap:8px;padding:2px 10px 8px;min-height:0;overflow:auto;max-height:220px;overscroll-behavior:contain}',
      '.gh-state-group{display:flex;flex-direction:column;gap:2px}',
      '.gh-state-group-title{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.gh-state-count{min-width:16px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10px;font-weight:500;text-align:center;letter-spacing:0;text-transform:none}',
      '.gh-state-files{display:flex;flex-direction:column;gap:1px}',
      '.gh-state-file{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px}',
      '.gh-state-file .gh-file-status,.gh-state-file .gh-file-path{color:inherit}',
      '.gh-tone-staged{color:var(--dsw-alias-state-success-primary)}',
      '.gh-tone-changes,.gh-tone-untracked,.gh-tone-conflict{color:var(--dsw-alias-state-error-primary)}',
      '.gh-tone-conflict{font-weight:600}',
      '.gh-state-sep{color:var(--dsw-alias-label-secondary)}',
      '.gh-state-muted{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-state-clean{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.gh-state-stashes{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.gh-file-status-untracked{color:var(--dsw-alias-label-secondary)}',
      '.gh-file-status-conflict{color:var(--dsw-alias-state-error-primary)}',
    ].join('')

    /** Header-trigger styling: the host's compact icon-button geometry. */
    const TRIGGER_STYLES = [
      '.gh-trigger-wrap{display:inline-flex;flex:none}',
      '.gh-trigger{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}',
      '.gh-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.gh-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.gh-trigger svg{width:15px;height:15px}',
    ].join('')

    /**
     * A commit-graph glyph: one stem, three commits, and a branch tip. It is this
     * plugin's own artwork, drawn in `currentColor` so both themes work.
     * @param {{ size?: number, className?: string }} props - icon geometry.
     * @returns {object} the SVG element.
     */
    function GitGraphGlyph({ size = 16, className }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          className,
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        },
        h('path', { d: 'M4 2.5v11' }),
        h('circle', { cx: 4, cy: 4, r: 1.7 }),
        h('circle', { cx: 4, cy: 8, r: 1.4 }),
        h('circle', { cx: 4, cy: 12, r: 1.4 }),
        h('path', { d: 'M4 4h4.2a2 2 0 0 1 2 2v2.6' }),
        h('circle', { cx: 10.4, cy: 10.2, r: 1.7 }),
      )
    }

    /** A refresh arrow glyph. */
    function RefreshGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
        h('path', { d: 'M13 2.6V5.2h-2.6' }),
      )
    }

    /** A back arrow glyph. */
    function BackGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M9.5 3.5 5 8l4.5 4.5' }),
      )
    }

    /**
     * Read one Host route as JSON; a refusal is a value, a transport failure throws.
     * @param {string} path - route path.
     * @param {Record<string, string | number>} params - query parameters.
     * @param {AbortSignal} signal - caller cancellation.
     * @returns {Promise<object>} the decoded answer.
     */
    async function requestJson(path, params, signal) {
      const url = new URL(path, window.location.origin)
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
      const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
      let value
      try {
        value = await response.json()
      } catch {
        throw new Error(`The host answered with status ${response.status}.`)
      }
      if (value === null || typeof value !== 'object') throw new Error('The host answered unexpectedly.')
      return value
    }

    /** Render-crash safety net: show the failure instead of blanking the whole tab. */
    class GitHistoryBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error !== null) {
          return h(
            'div',
            { className: 'gh-note', role: 'alert' },
            h('span', { className: 'gh-note-title' }, this.props.t('error.title')),
            h('p', { className: 'gh-note-body' }, String((this.state.error && this.state.error.message) || this.state.error)),
          )
        }
        return this.props.children
      }
    }

    /** Basename of an absolute path, for the compact repository label. */
    function baseName(path) {
      if (typeof path !== 'string') return ''
      const trimmed = path.replace(/\/+$/, '')
      const cut = trimmed.lastIndexOf('/')
      return cut === -1 ? trimmed : trimmed.slice(cut + 1)
    }

    /** Short, locale-aware commit date; falls back to the raw value. */
    function formatDate(iso) {
      if (typeof iso !== 'string' || iso.length === 0) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return iso
      try {
        return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
      } catch {
        return date.toISOString().slice(0, 10)
      }
    }

    /** Single-letter change kind shown in the changed-file list. */
    const STATUS_LETTERS = Object.freeze({
      added: 'A',
      deleted: 'D',
      modified: 'M',
      renamed: 'R',
      copied: 'C',
      untracked: '?',
      conflict: 'U',
    })

    /** The diff block that belongs to one changed file, when the commit carries one. */
    function blockOf(file, blocks) {
      if (file === undefined) return undefined
      if (Number.isInteger(file.patchIndex) && blocks[file.patchIndex] !== undefined) return blocks[file.patchIndex]
      return blocks.find((block) => block.path === file.path)
    }

    /** One row of the changed-file panel: kind letter, path, counts, and its selection state. */
    function FileRow({ file, selected, onSelect, t }) {
      const known = STATUS_LETTERS[file.status] !== undefined
      const kind = known ? file.status : 'modified'
      const status = STATUS_LETTERS[kind]
      const path = file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`
      const counts = file.binary ? t('detail.binary') : undefined
      return h(
        'button',
        {
          type: 'button',
          className: 'gh-file',
          'aria-current': selected ? 'true' : undefined,
          'aria-label': `${file.path} — ${t(`status.${kind}`)}${file.binary ? '' : `, +${file.added} −${file.removed}`}`,
          title: file.oldPath === undefined ? file.path : t('detail.rename', { path: file.oldPath }),
          onClick: onSelect,
        },
        h('span', { className: `gh-file-status gh-file-status-${kind}`, 'aria-hidden': true }, status),
        h('span', { className: 'gh-file-path' }, path),
        counts === undefined
          ? h(DiffStat, { added: file.added, removed: file.removed })
          : h('span', { className: 'gh-counts' }, counts),
      )
    }

    /** A chevron for the per-file stepping controls. */
    function ChevronGlyph({ direction }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 13,
          height: 13,
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style:
            direction === 'left' || direction === 'down' || direction === 'up'
              ? { transform: `rotate(${direction === 'left' ? 180 : direction === 'down' ? 90 : 270}deg)` }
              : undefined,
        },
        h('path', { d: 'M6 3.5 10.5 8 6 12.5' }),
      )
    }

    /** The selected file's diff: a sticky header with stepping controls, then its patch lines. */
    function DiffPanel({ block, file, index, count, truncated, t, onPrevious, onNext }) {
      const known = STATUS_LETTERS[file.status] !== undefined
      const kind = known ? file.status : 'modified'
      const statusLetter = STATUS_LETTERS[kind]
      return h(
        'div',
        { className: 'gh-diff', 'data-git-history-file': file.path, 'data-git-history': 'diff' },
        h(
          'div',
          { className: 'gh-diff-head' },
          h('span', { className: `gh-file-status gh-file-status-${kind}`, 'aria-hidden': true }, statusLetter),
          h('span', { className: 'gh-diff-path', title: file.path }, file.path),
          h('span', { className: 'gh-diff-counter' }, `${index + 1}/${count}`),
          h(
            'span',
            { className: 'gh-diff-nav' },
            h(
              'button',
              {
                type: 'button',
                className: 'gh-diff-step',
                title: t('detail.previousFile'),
                'aria-label': t('detail.previousFile'),
                onClick: onPrevious,
                disabled: count <= 1,
              },
              h(ChevronGlyph, { direction: 'left' }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'gh-diff-step',
                title: t('detail.nextFile'),
                'aria-label': t('detail.nextFile'),
                onClick: onNext,
                disabled: count <= 1,
              },
              h(ChevronGlyph, { direction: 'right' }),
            ),
          ),
        ),
        truncated ? h('p', { className: 'gh-notice' }, t('detail.truncated')) : null,
        block === undefined || block.binary
          ? h('p', { className: 'gh-diff-empty' }, block !== undefined && block.binary ? t('detail.binary') : t('detail.emptyDiff'))
          : block.lines.length === 0
            ? h('p', { className: 'gh-diff-empty' }, t('detail.emptyDiff'))
            : h(
                'pre',
                { className: 'gh-diff-body' },
                block.lines.map((line, lineIndex) =>
                  h('span', { key: lineIndex, className: `gh-line gh-line-${line.kind}` }, `${line.text}\n`),
                ),
              ),
      )
    }

    /** Added and removed line counts, colored the way Git's own diff output is. */
    function DiffStat({ added, removed }) {
      if (typeof added !== 'number' || typeof removed !== 'number') return null
      return h(
        'span',
        { className: 'gh-diffstat' },
        h('span', { className: 'gh-stat-add' }, `+${added}`),
        h('span', { className: 'gh-stat-del' }, `−${removed}`),
      )
    }

    /** One compact commit row in the history list. */
    function CommitRow({ commit, onOpen }) {
      const date = formatDate(commit.authorDate)
      return h(
        'button',
        {
          type: 'button',
          className: 'gh-row',
          'data-git-history-commit': commit.hash,
          onClick: () => onOpen(commit.hash),
          title: `${commit.hash}\n${commit.subject}`,
        },
        h(
          'span',
          { className: 'gh-row-top' },
          h('span', { className: 'gh-hash' }, commit.short),
          commit.refs.slice(0, 3).map((ref) => h('span', { key: ref, className: 'gh-ref', title: ref }, ref)),
          h(
            'span',
            { className: 'gh-row-tail' },
            h(DiffStat, { added: commit.added, removed: commit.removed }),
            h('span', { className: 'gh-date', title: commit.authorDate }, date),
          ),
        ),
        h('span', { className: 'gh-subject' }, commit.subject),
        h('span', { className: 'gh-author' }, commit.author),
      )
    }

    /**
     * The tab body: the commit list, or one commit opened over it.
     *
     * Data stays local to the body: a `revision` bump re-reads whichever view is
     * open, and each effect aborts its own request when it re-runs or unmounts.
     */
    function GitHistoryBody(props) {
      const { sessionId, t } = props
      const [revision, setRevision] = React.useState(0)
      const [statusRevision, setStatusRevision] = React.useState(0)
      const [list, setList] = React.useState({ phase: 'loading' })
      const [worktree, setWorktree] = React.useState({ phase: 'loading' })
      const [openHash, setOpenHash] = React.useState(null)
      const [detail, setDetail] = React.useState({ phase: 'idle' })
      const moreController = React.useRef(undefined)

      React.useEffect(() => {
        const controller = new AbortController()
        setList({ phase: 'loading' })
        requestJson(COMMITS_PATH, { sessionId, limit: PAGE_SIZE }, controller.signal).then(
          (answer) => {
            if (controller.signal.aborted) return
            if (answer.ok !== true) {
              setList({ phase: 'refused', code: answer.code, message: answer.message })
              return
            }
            setList({
              phase: 'ready',
              repository: answer.repository,
              commits: answer.commits,
              hasMore: answer.hasMore === true,
              loadingMore: false,
            })
          },
          (error) => {
            if (controller.signal.aborted) return
            setList({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
          },
        )
        return () => controller.abort()
      }, [sessionId, revision])

      React.useEffect(() => {
        const bump = () => setStatusRevision((value) => value + 1)
        window.addEventListener('focus', bump)
        return () => window.removeEventListener('focus', bump)
      }, [])

      React.useEffect(() => {
        const controller = new AbortController()
        setWorktree({ phase: 'loading' })
        requestJson(STATUS_PATH, { sessionId }, controller.signal).then(
          (answer) => {
            if (controller.signal.aborted) return
            if (answer.ok !== true) {
              setWorktree({ phase: 'refused', code: answer.code, message: answer.message })
              return
            }
            setWorktree({ phase: 'ready', data: answer })
          },
          (error) => {
            if (controller.signal.aborted) return
            setWorktree({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
          },
        )
        return () => controller.abort()
      }, [sessionId, revision, statusRevision])

      React.useEffect(() => {
        if (openHash === null) {
          setDetail({ phase: 'idle' })
          return undefined
        }
        const controller = new AbortController()
        setDetail({ phase: 'loading' })
        requestJson(COMMIT_PATH, { sessionId, hash: openHash }, controller.signal).then(
          (answer) => {
            if (controller.signal.aborted) return
            if (answer.ok !== true) {
              setDetail({ phase: 'error', message: answer.message })
              return
            }
            setDetail({ phase: 'ready', data: answer })
          },
          (error) => {
            if (controller.signal.aborted) return
            setDetail({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
          },
        )
        return () => controller.abort()
      }, [sessionId, openHash, revision])

      React.useEffect(
        () => () => {
          if (moreController.current !== undefined) moreController.current.abort()
        },
        [],
      )

      const refresh = () => setRevision((value) => value + 1)

      const loadMore = () => {
        if (list.phase !== 'ready' || list.loadingMore || list.hasMore !== true) return
        const skip = list.commits.length
        const controller = new AbortController()
        if (moreController.current !== undefined) moreController.current.abort()
        moreController.current = controller
        setList((current) => (current.phase === 'ready' ? { ...current, loadingMore: true } : current))
        requestJson(COMMITS_PATH, { sessionId, limit: PAGE_SIZE, skip }, controller.signal).then(
          (answer) => {
            if (controller.signal.aborted) return
            if (answer.ok !== true) {
              setList((current) => (current.phase === 'ready' ? { ...current, loadingMore: false } : current))
              return
            }
            setList((current) => {
              if (current.phase !== 'ready') return current
              return {
                ...current,
                commits: current.commits.concat(answer.commits),
                hasMore: answer.hasMore === true,
                loadingMore: false,
              }
            })
          },
          () => {
            if (controller.signal.aborted) return
            setList((current) => (current.phase === 'ready' ? { ...current, loadingMore: false } : current))
          },
        )
      }

      const openCommit = (hash) => setOpenHash(hash)
      const closeCommit = () => setOpenHash(null)

      const toolbar = h(
        'div',
        { className: 'gh-toolbar' },
        h(
          'div',
          { className: 'gh-repo' },
          h('span', { className: 'gh-repo-name', title: list.phase === 'ready' ? list.repository.root : undefined }, repositoryName(list)),
          h(
            'span',
            { className: 'gh-repo-detail' },
            list.phase === 'ready' && list.repository.branch !== undefined
              ? h('span', { className: 'gh-branch', title: list.repository.branch }, list.repository.branch)
              : null,
            list.phase === 'ready' && list.repository.head !== undefined
              ? h('span', { className: 'gh-branch' }, list.repository.head)
              : null,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'gh-tool',
            title: t('refresh'),
            'aria-label': t('refresh'),
            onClick: refresh,
            disabled: list.phase === 'loading',
          },
          h(RefreshGlyph),
        ),
      )

      let content
      if (openHash !== null) {
        content = h(CommitDetail, { detail, t, onBack: closeCommit, onParent: openCommit, onRetry: refresh })
      } else if (list.phase === 'loading') {
        content = h('div', { className: 'gh-note' }, h('p', { className: 'gh-note-body' }, t('loading')))
      } else if (list.phase === 'error') {
        content = h(
          'div',
          { className: 'gh-note', role: 'alert' },
          h('span', { className: 'gh-note-title' }, t('error.title')),
          h('p', { className: 'gh-note-body' }, list.message),
          h('button', { type: 'button', className: 'gh-note-action', onClick: refresh }, t('error.retry')),
        )
      } else if (list.phase === 'refused') {
        content = h(RefusalNote, { code: list.code, message: list.message, t })
      } else if (list.commits.length === 0) {
        content = h('div', { className: 'gh-note' }, h('p', { className: 'gh-note-body' }, t('empty.commits')))
      } else {
        content = h(
          'div',
          { className: 'gh-list' },
          h(RepositoryState, { worktree, t }),
          h(
            'div',
            { className: 'gh-scroll' },
            list.commits.map((commit) => h(CommitRow, { key: commit.hash, commit, onOpen: openCommit })),
            list.hasMore
              ? h(
                  'button',
                  { type: 'button', className: 'gh-more', onClick: loadMore, disabled: list.loadingMore === true },
                  list.loadingMore === true ? t('more.loading') : t('more'),
                )
              : null,
          ),
        )
      }

      return h('div', { className: 'gh-root', 'data-git-history': 'body' }, h('style', null, BODY_STYLES), toolbar, content)
    }

    /** The repository label: its directory name, or a neutral placeholder. */
    function repositoryName(list) {
      if (list.phase !== 'ready') return 'Git'
      return baseName(list.repository.root) || list.repository.root
    }

    /** Empty state for a workspace without a repository or without a directory. */
    function RefusalNote({ code, message, t }) {
      const known = code === 'not-a-repository' || code === 'no-directory'
      const body = known ? t(`refused.${code}.body`) : message
      return h(
        'div',
        { className: 'gh-note' },
        h('span', { className: 'gh-note-title' }, known ? t(`refused.${code}.title`) : t('refused.other.title')),
        h('p', { className: 'gh-note-body' }, body),
      )
    }

    /** A branch glyph for the working-tree panel. */
    function BranchGlyph() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 13,
          height: 13,
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        },
        h('path', { d: 'M4.5 3.5v9' }),
        h('circle', { cx: 4.5, cy: 3.5, r: 1.5 }),
        h('circle', { cx: 4.5, cy: 12.5, r: 1.5 }),
        h('path', { d: 'M4.5 8h4a2.2 2.2 0 0 0 2.2-2.2V5' }),
        h('circle', { cx: 10.7, cy: 3.5, r: 1.5 }),
      )
    }

    /**
     * One working-tree group. Its header with the count is always rendered so an
     * empty list reads as "0", and rows follow only when the group has entries.
     */
    function StateGroup({ title, files, tone }) {
      const list = Array.isArray(files) ? files : []
      const fallback = tone === 'untracked' ? 'untracked' : tone === 'conflict' ? 'conflict' : 'modified'
      return h(
        'div',
        { className: 'gh-state-group', 'data-git-history-group': title },
        h('div', { className: 'gh-state-group-title' }, title, h('span', { className: 'gh-state-count' }, list.length)),
        list.length === 0
          ? null
          : h(
              'div',
              { className: 'gh-state-files' },
              list.map((file, index) => {
                const status = file.status === undefined ? fallback : file.status
                const letter = STATUS_LETTERS[status] === undefined ? '?' : STATUS_LETTERS[status]
                const path = file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`
                return h(
                  'div',
                  { key: `${index}:${file.path}`, className: `gh-state-file gh-tone-${tone}`, title: file.path },
                  h('span', { className: `gh-file-status gh-file-status-${status}`, 'aria-hidden': true }, letter),
                  h('span', { className: 'gh-file-path' }, path),
                )
              }),
            ),
      )
    }

    /**
     * The repository state above the commit list: branch and its upstream with
     * ahead/behind, staged paths, unstaged changes, untracked paths, conflicts,
     * and the stash count. Collapsible; the header keeps the summary visible.
     */
    function RepositoryState({ worktree, t }) {
      const [collapsed, setCollapsed] = React.useState(false)
      if (worktree.phase === 'loading') {
        return h(
          'section',
          { className: 'gh-state', 'data-git-history': 'worktree' },
          h('div', { className: 'gh-state-head' }, h('span', { className: 'gh-state-muted' }, t('status.loading'))),
        )
      }
      if (worktree.phase === 'error' || worktree.phase === 'refused') {
        return h(
          'section',
          { className: 'gh-state', 'data-git-history': 'worktree' },
          h(
            'div',
            { className: 'gh-state-head' },
            h('span', { className: 'gh-state-muted', title: worktree.message }, t('status.unavailable')),
          ),
        )
      }
      const data = worktree.data
      const branch = data.branch === undefined ? {} : data.branch
      const counts = data.counts === undefined ? { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 } : data.counts
      const total = counts.staged + counts.unstaged + counts.untracked + counts.conflicts
      const detached = branch.detached === true
      const head = data.repository === undefined ? '' : data.repository.head ?? ''
      const branchLabel = detached ? `HEAD @ ${head}` : typeof branch.name === 'string' && branch.name.length > 0 ? branch.name : 'HEAD'
      const tracking = []
      if (branch.ahead > 0) {
        tracking.push(h('span', { key: 'ahead', className: 'gh-state-track', title: t('status.ahead', { count: branch.ahead }) }, `↑${branch.ahead}`))
      }
      if (branch.behind > 0) {
        tracking.push(h('span', { key: 'behind', className: 'gh-state-track', title: t('status.behind', { count: branch.behind }) }, `↓${branch.behind}`))
      }
      const parts = []
      if (counts.staged > 0) parts.push({ key: 'staged', tone: 'gh-tone-staged', text: `${counts.staged} ${t('status.staged')}` })
      if (counts.unstaged > 0) parts.push({ key: 'changes', tone: 'gh-tone-changes', text: `${counts.unstaged} ${t('status.changed')}` })
      if (counts.untracked > 0) parts.push({ key: 'untracked', tone: 'gh-tone-untracked', text: `${counts.untracked} ${t('status.untracked')}` })
      if (counts.conflicts > 0) parts.push({ key: 'conflict', tone: 'gh-tone-conflict', text: `${counts.conflicts} ${t('status.conflicts')}` })
      const summary = total === 0 ? t('status.clean') : parts.map((part) => part.text).join(' · ')
      const summaryNodes = []
      if (total === 0) {
        summaryNodes.push(h('span', { key: 'clean' }, t('status.clean')))
      } else {
        parts.forEach((part, index) => {
          if (index > 0) summaryNodes.push(h('span', { key: `sep${index}`, className: 'gh-state-sep' }, ' · '))
          summaryNodes.push(h('span', { key: part.key, className: part.tone }, part.text))
        })
      }
      return h(
        'section',
        { className: 'gh-state', 'data-git-history': 'worktree', 'data-git-history-clean': total === 0 ? 'true' : undefined },
        h(
          'div',
          { className: 'gh-state-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'gh-state-toggle',
              'aria-expanded': !collapsed,
              'aria-label': t(collapsed ? 'status.show' : 'status.hide'),
              title: t(collapsed ? 'status.show' : 'status.hide'),
              onClick: () => setCollapsed((value) => !value),
            },
            h(ChevronGlyph, { direction: collapsed ? 'right' : 'down' }),
          ),
          h('span', { className: 'gh-state-branch', title: branchLabel }, h(BranchGlyph), branchLabel),
          tracking.length > 0 ? h('span', { className: 'gh-state-track' }, tracking) : null,
          h('span', { className: 'gh-state-summary', title: summary }, summaryNodes),
        ),
        collapsed
          ? null
          : h(
              'div',
              { className: 'gh-state-body' },
              total === 0
                ? h('p', { className: 'gh-state-clean' }, t('status.clean'))
                : [
                    h(StateGroup, { key: 'staged', title: t('status.staged'), files: data.staged, tone: 'staged' }),
                    h(StateGroup, { key: 'changed', title: t('status.changed'), files: data.unstaged, tone: 'changes' }),
                    h(StateGroup, { key: 'untracked', title: t('status.untracked'), files: data.untracked, tone: 'untracked' }),
                    h(StateGroup, { key: 'conflicts', title: t('status.conflicts'), files: data.conflicts, tone: 'conflict' }),
                  ],
              typeof data.stashes === 'number' && data.stashes > 0
                ? h('p', { className: 'gh-state-stashes' }, t('status.stashes', { count: data.stashes }))
                : null,
            ),
      )
    }

    /** One commit: metadata, a panel of changed files, and the selected file's diff. */
    function CommitDetail({ detail, t, onBack, onParent, onRetry }) {
      // Remember the chosen file per commit hash; a newly opened commit starts on its first
      // file that actually carries a patch, so stepping always lands on something to read.
      const [selection, setSelection] = React.useState({ hash: '', index: 0 })
      const backBar = h(
        'div',
        { className: 'gh-bar' },
        h(
          'button',
          { type: 'button', className: 'gh-back', onClick: onBack },
          h(BackGlyph),
          h('span', { className: 'gh-back-text' }, t('back')),
        ),
        detail.phase === 'ready'
          ? h('span', { className: 'gh-detail-hash', title: detail.data.commit.hash }, detail.data.commit.short)
          : null,
      )
      if (detail.phase === 'loading' || detail.phase === 'idle') {
        return h(
          'div',
          { className: 'gh-detail', 'data-git-history': 'detail' },
          backBar,
          h('div', { className: 'gh-note' }, h('p', { className: 'gh-note-body' }, t('loading.detail'))),
        )
      }
      if (detail.phase === 'error') {
        return h(
          'div',
          { className: 'gh-detail', 'data-git-history': 'detail' },
          backBar,
          h(
            'div',
            { className: 'gh-note', role: 'alert' },
            h('span', { className: 'gh-note-title' }, t('error.title')),
            h('p', { className: 'gh-note-body' }, detail.message),
            h('button', { type: 'button', className: 'gh-note-action', onClick: onRetry }, t('error.retry')),
          ),
        )
      }
      const data = detail.data
      const commit = data.commit
      const files = Array.isArray(data.files) ? data.files : []
      const blocks = Array.isArray(data.patch) ? data.patch : []
      const parents = Array.isArray(commit.parents) ? commit.parents : []
      const fullBody = typeof commit.body === 'string' ? commit.body : ''
      const subject = typeof commit.subject === 'string' && commit.subject.length > 0 ? commit.subject : fullBody.split('\n')[0]
      const body = fullBody.startsWith(subject) ? fullBody.slice(subject.length).replace(/^\n+/, '') : fullBody
      const additions = files.reduce((sum, file) => sum + file.added, 0)
      const deletions = files.reduce((sum, file) => sum + file.removed, 0)
      const fileSummary = files.length === 1 ? t('detail.files.one') : t('detail.files', { count: files.length })
      const firstWithDiff = files.findIndex((file) => blockOf(file, blocks) !== undefined)
      const fallbackIndex = firstWithDiff === -1 ? 0 : firstWithDiff
      const selectedIndex = selection.hash === commit.hash && selection.index >= 0 && selection.index < files.length ? selection.index : fallbackIndex
      const selectedFile = files[selectedIndex]
      const selectedBlock = blockOf(selectedFile, blocks)
      const select = (index) => setSelection({ hash: commit.hash, index })
      const step = (delta) => {
        if (files.length <= 1) return
        select((selectedIndex + delta + files.length) % files.length)
      }
      const summary = h(
        'div',
        { className: 'gh-section-title' },
        fileSummary,
        ' · ',
        h(DiffStat, { added: additions, removed: deletions }),
      )
      const sections = [
        subject.length > 0 ? h('h2', { key: 'title', className: 'gh-title' }, subject) : null,
        body.length > 0 ? h('pre', { key: 'message', className: 'gh-message' }, body) : null,
        h(
          'div',
          { key: 'facts', className: 'gh-facts' },
          h('span', { className: 'gh-fact-label' }, t('detail.author')),
          h(
            'span',
            { className: 'gh-fact-value' },
            typeof commit.authorEmail === 'string' && commit.authorEmail.length > 0 ? `${commit.author} <${commit.authorEmail}>` : commit.author,
          ),
          h('span', { className: 'gh-fact-label' }, t('detail.committed')),
          h('span', { className: 'gh-fact-value', title: commit.committerDate }, `${formatDate(commit.authorDate)}${commit.committer !== commit.author ? ` · ${commit.committer}` : ''}`),
          parents.length > 0
            ? [
                h('span', { key: 'parents-label', className: 'gh-fact-label' }, t('detail.parents')),
                h(
                  'span',
                  { key: 'parents-value', className: 'gh-parents' },
                  parents.map((parent) =>
                    h('button', { key: parent, type: 'button', className: 'gh-parent', onClick: () => onParent(parent) }, parent.slice(0, 7)),
                  ),
                ),
              ]
            : null,
        ),
      ]
      if (files.length === 0) {
        sections.push(
          h(
            'div',
            { key: 'empty', className: 'gh-section' },
            summary,
            h('p', { className: 'gh-note-body' }, data.merge ? t('detail.merge') : t('detail.noChanges')),
          ),
        )
      } else {
        sections.push(
          h(
            'div',
            { key: 'files', className: 'gh-section', 'data-git-history': 'files' },
            summary,
            h(
              'div',
              { className: 'gh-files-panel', role: 'group', 'aria-label': t('detail.changedFiles') },
              files.map((file, index) =>
                h(FileRow, {
                  key: `${index}:${file.path}`,
                  file,
                  selected: index === selectedIndex,
                  onSelect: () => select(index),
                  t,
                }),
              ),
            ),
          ),
        )
        if (selectedFile !== undefined) {
          sections.push(
            h(DiffPanel, {
              key: `diff:${selectedIndex}:${selectedFile.path}`,
              block: selectedBlock,
              file: selectedFile,
              index: selectedIndex,
              count: files.length,
              truncated: data.truncated === true,
              t,
              onPrevious: () => step(-1),
              onNext: () => step(1),
            }),
          )
        }
      }
      return h('div', { className: 'gh-detail', 'data-git-history': 'detail' }, backBar, h('div', { className: 'gh-scroll' }, sections))
    }

    /** The tab chip: the graph glyph followed by the live localized title. */
    function GitHistoryTitle({ t }) {
      return h(React.Fragment, null, h('style', null, TRIGGER_STYLES), h(GitGraphGlyph, { size: 16 }), t('tab.title'))
    }

    /** The conversation-header button that opens the history tab. */
    function GitHistoryTrigger({ t, open }) {
      return h(
        'span',
        { className: 'gh-trigger-wrap' },
        h('style', null, TRIGGER_STYLES),
        h(
          'button',
          {
            type: 'button',
            className: 'gh-trigger',
            title: t('trigger.tooltip'),
            'aria-label': t('trigger.label'),
            'data-git-history': 'trigger',
            onClick: open,
          },
          h(GitGraphGlyph, { size: 16 }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        /** Open the tab; a missing surface is a wiring state, never a crash in a header seat. */
        const open = () => {
          try {
            ctx.sidebarRight.openTab(KIND)
          } catch (error) {
            console.warn('git-history: could not open the sidebar tab', error)
          }
        }
        ctx.effect(
          () => ctx.locale.register(NS, { zh, en }),
          'git-history: dictionaries',
        )
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: ID,
              kind: KIND,
              priority: 'extension',
              title: () => t('tab.title'),
              guide: [
                {
                  id: 'git-history',
                  order: 30,
                  title: () => t('guide.title'),
                  description: () => t('guide.description'),
                  icon: GitGraphGlyph,
                },
              ],
            }),
          'git-history: tab type',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register(
                { name: 'sidebar.right.pane.tab', key: ID, locale: NS },
                (props) => h(GitHistoryBoundary, { t: props.t }, h(GitHistoryBody, props)),
              ),
            ),
          'git-history: tab body',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab.title', () =>
              ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID, locale: NS }, GitHistoryTitle),
            ),
          'git-history: tab title',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.session.header.utilities', () =>
              ctx.slots.register(
                {
                  name: 'conversation.session.header.utilities',
                  id: 'git-history',
                  order: 20,
                  locale: NS,
                  inject: () => ({ open }),
                },
                GitHistoryTrigger,
              ),
            ),
          'git-history: header trigger',
        )
      },
    }
  },
})
