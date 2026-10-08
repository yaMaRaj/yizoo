import { useEffect, useMemo, useRef, useState, type CompositionEvent } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import { PERM, type ZkAcl } from '@shared/types'
import { askConfirm } from '../../components/confirm-store'

type Tab = 'data' | 'meta' | 'acl'
type ViewFormat = 'raw' | 'json' | 'xml'

function prettyJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return text
  return JSON.stringify(JSON.parse(trimmed), null, 2)
}

function prettyXml(text: string): string {
  const cleaned = text.trim()
  if (!cleaned) return text
  let indent = 0
  return cleaned
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((line) => {
      if (/^<\/\w/.test(line)) indent = Math.max(indent - 1, 0)
      const out = `${'  '.repeat(indent)}${line}`
      if (/^<\w[^>]*[^/]>$/.test(line)) indent += 1
      return out
    })
    .join('\n')
}

/** Pure view transform — never used as the saved payload unless user edits. */
function formatForView(canonical: string, format: ViewFormat): { text: string; error?: string } {
  if (format === 'raw') return { text: canonical }
  try {
    if (format === 'json') return { text: prettyJson(canonical) }
    return { text: prettyXml(canonical) }
  } catch (err) {
    return {
      text: canonical,
      error:
        format === 'json'
          ? `无法解析为 JSON：${err instanceof Error ? err.message : String(err)}`
          : `无法格式化为 XML：${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function monacoLang(format: ViewFormat): string {
  if (format === 'json') return 'json'
  if (format === 'xml') return 'xml'
  return 'plaintext'
}

export function DataEditor() {
  const { t } = useTranslation()
  const {
    activeId,
    selectedPath,
    nodeData,
    editorDraft,
    editorDirty,
    setEditorDraft,
    setEditorDirty,
    setEditorLang,
    setNodeData,
    setError,
    setChildren,
  } = useAppStore()
  const settings = useAppStore((s) => s.settings)
  const [tab, setTab] = useState<Tab>('data')
  const [viewFormat, setViewFormat] = useState<ViewFormat>('raw')
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newData, setNewData] = useState('')
  const [ephemeral, setEphemeral] = useState(false)
  const [sequential, setSequential] = useState(false)
  const [aclDraft, setAclDraft] = useState<ZkAcl[]>([])
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const [findCount, setFindCount] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const monacoRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  /** Skip the first Monaco onChange after format switch (it echoes display text). */
  const ignoreNextChangeRef = useRef(false)
  const composingRef = useRef(false)
  /** Epoch of last external load (path / server refresh) so we don't clobber in-progress edits. */
  const loadKeyRef = useRef(`${selectedPath}::`)

  const serverData = nodeData?.data ?? ''
  const canonical = editorDraft ?? ''

  /**
   * Local buffer shown in the editor. Pretty/minify only runs on format switch or
   * external reload — never on every keystroke (that made inserts bounce back).
   */
  const [viewText, setViewText] = useState(canonical)

  useEffect(() => {
    setViewFormat('raw')
    setEditorLang('plaintext')
    setTab('data')
    setFindOpen(false)
    setFindQuery('')
    setFindIndex(0)
    setFindCount(0)
  }, [selectedPath, setEditorLang])

  // Sync view buffer when path changes or server data reloads while clean
  useEffect(() => {
    const pathChanged = loadKeyRef.current.split('::')[0] !== selectedPath
    loadKeyRef.current = `${selectedPath}::${nodeData?.stat.version ?? ''}:${nodeData?.stat.mtime ?? ''}`
    if (pathChanged || !editorDirty) {
      setViewText(formatForView(editorDraft ?? '', pathChanged ? 'raw' : viewFormat).text)
    }
  }, [
    selectedPath,
    nodeData?.stat.version,
    nodeData?.stat.mtime,
    serverData,
    editorDirty,
    editorDraft,
    viewFormat,
  ])

  // Keep dirty tied to canonical vs server (covers external draft updates)
  useEffect(() => {
    if (!nodeData || composingRef.current) return
    setEditorDirty(canonical !== serverData)
  }, [canonical, serverData, nodeData, setEditorDirty])

  useEffect(() => {
    if (viewFormat === 'raw' || monacoReady || monacoFailed) return
    const timer = window.setTimeout(() => setMonacoFailed(true), 2500)
    return () => window.clearTimeout(timer)
  }, [viewFormat, monacoReady, monacoFailed])

  const editorLanguage = useMemo(() => monacoLang(viewFormat), [viewFormat])
  const usePlainEditor = viewFormat === 'raw' || monacoFailed
  const displayText = viewText

  function switchFormat(next: ViewFormat) {
    if (next === viewFormat) return
    const result = formatForView(canonical, next)
    if (result.error && next !== 'raw') {
      setError(result.error)
      return
    }
    setError(null)
    ignoreNextChangeRef.current = true
    setViewFormat(next)
    setViewText(result.text)
    setEditorLang(next === 'raw' ? 'plaintext' : next)
    setMonacoFailed(false)
    setMonacoReady(false)
    // Do NOT touch editorDraft / dirty — format is view-only
  }

  function onUserEdit(nextDisplay: string) {
    if (ignoreNextChangeRef.current) {
      ignoreNextChangeRef.current = false
      // If Monaco echoes the formatted view, ignore; canonical stays
      if (nextDisplay === viewText) return
    }
    setViewText(nextDisplay)
    // While IME is composing, keep the buffer local; commit on composition end
    if (composingRef.current) return
    setEditorDraft(nextDisplay)
    setEditorDirty(nextDisplay !== serverData)
  }

  function onCompositionStart() {
    composingRef.current = true
    // Mark dirty immediately so ZK watchers cannot wipe the IME session
    setEditorDirty(true)
  }

  function onCompositionEnd(e: CompositionEvent<HTMLTextAreaElement>) {
    composingRef.current = false
    const next = e.currentTarget.value
    setViewText(next)
    setEditorDraft(next)
    setEditorDirty(next !== serverData)
  }

  function collectMatchIndexes(text: string, query: string): number[] {
    if (!query) return []
    const indexes: number[] = []
    const lower = text.toLowerCase()
    const q = query.toLowerCase()
    let from = 0
    while (from <= lower.length) {
      const i = lower.indexOf(q, from)
      if (i < 0) break
      indexes.push(i)
      from = i + Math.max(q.length, 1)
      if (indexes.length > 2000) break
    }
    return indexes
  }

  function applyFind(nextIndex?: number) {
    const text = displayText
    const matches = collectMatchIndexes(text, findQuery)
    setFindCount(matches.length)
    if (matches.length === 0) {
      setFindIndex(0)
      return
    }
    const idx =
      nextIndex == null
        ? findIndex % matches.length
        : ((nextIndex % matches.length) + matches.length) % matches.length
    setFindIndex(idx)
    const start = matches[idx]
    const end = start + findQuery.length

    if (usePlainEditor && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      el.setSelectionRange(start, end)
      // Scroll roughly into view
      const before = text.slice(0, start)
      const line = before.split('\n').length
      const lineHeight = 19.5
      el.scrollTop = Math.max(0, (line - 3) * lineHeight)
      return
    }

    const ed = monacoRef.current
    if (ed) {
      const model = ed.getModel()
      if (!model) return
      const startPos = model.getPositionAt(start)
      const endPos = model.getPositionAt(end)
      ed.setSelection({
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      })
      ed.revealRangeInCenter({
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      })
      ed.focus()
    }
  }

  useEffect(() => {
    if (!findOpen || !findQuery) {
      setFindCount(0)
      return
    }
    const matches = collectMatchIndexes(displayText, findQuery)
    setFindCount(matches.length)
    if (matches.length > 0) {
      const idx = Math.min(findIndex, matches.length - 1)
      setFindIndex(idx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run find counts when text/query changes
  }, [displayText, findQuery, findOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && tab === 'data') {
        e.preventDefault()
        setFindOpen(true)
      }
      if (e.key === 'Escape' && findOpen) {
        setFindOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, findOpen])

  const onMonacoMount: OnMount = (ed) => {
    monacoRef.current = ed
    setMonacoReady(true)
  }

  if (!activeId || !nodeData) {
    return <div className="empty-state">{t('empty')}</div>
  }

  async function saveData() {
    if (!activeId || !nodeData) return
    try {
      const stat = await window.yizoo.zk.setData(
        activeId,
        selectedPath,
        canonical,
        nodeData.stat.version,
      )
      setNodeData({ ...nodeData, data: canonical, stat })
      setEditorDirty(false)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg.includes('BadVersion') ? t('versionConflict') : msg)
    }
  }

  async function refresh() {
    if (!activeId) return
    try {
      const data = await window.yizoo.zk.getData(activeId, selectedPath)
      const text = typeof data?.data === 'string' ? data.data : ''
      setNodeData(data)
      setEditorDraft(text)
      setEditorDirty(false)
      setViewFormat('raw')
      setViewText(text)
      setEditorLang('plaintext')
      setAclDraft(data.acls ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(recursive: boolean) {
    if (!activeId) return
    const ok = await askConfirm({
      title: t('brand'),
      message: t('confirmDelete'),
      confirmLabel: t('ok'),
      cancelLabel: t('cancel'),
      danger: true,
    })
    if (!ok) return
    try {
      await window.yizoo.zk.remove(activeId, selectedPath, recursive)
      const parent =
        selectedPath === '/' ? '/' : selectedPath.slice(0, selectedPath.lastIndexOf('/')) || '/'
      const kids = await window.yizoo.zk.listChildren(activeId, parent)
      setChildren(
        parent,
        kids.map((k) => k.name),
      )
      window.dispatchEvent(new CustomEvent('yizoo:select-path', { detail: parent }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function create() {
    if (!activeId || !newPath) return
    const full = newPath.startsWith('/')
      ? newPath
      : selectedPath === '/'
        ? `/${newPath}`
        : `${selectedPath}/${newPath}`
    try {
      await window.yizoo.zk.create(activeId, full, newData, ephemeral, sequential)
      setCreateOpen(false)
      setNewPath('')
      setNewData('')
      const parent = full.slice(0, full.lastIndexOf('/')) || '/'
      const kids = await window.yizoo.zk.listChildren(activeId, parent)
      setChildren(
        parent,
        kids.map((k) => k.name),
      )
      window.dispatchEvent(new CustomEvent('yizoo:select-path', { detail: full }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveAcl() {
    if (!activeId || !nodeData) return
    try {
      const acls = aclDraft.length ? aclDraft : nodeData.acls
      const stat = await window.yizoo.zk.setAcl(
        activeId,
        selectedPath,
        acls,
        nodeData.stat.aversion,
      )
      setNodeData({ ...nodeData, acls, stat })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const dataLength = nodeData.stat?.dataLength ?? 0

  return (
    <>
      <div className="editor-toolbar">
        <div className="tabs">
          {(['data', 'meta', 'acl'] as Tab[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`tab ${tab === k ? 'active' : ''}`}
              onClick={() => {
                setTab(k)
                if (k === 'acl') setAclDraft(nodeData.acls)
              }}
            >
              {t(k)}
            </button>
          ))}
        </div>

        {tab === 'data' && (
          <>
            <div className="format-switch" role="group" aria-label="data format">
              {([
                ['raw', 'RAW'],
                ['json', 'JSON'],
                ['xml', 'XML'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`format-btn ${viewFormat === id ? 'active' : ''}`}
                  onClick={() => switchFormat(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn"
              type="button"
              title="Ctrl+F"
              onClick={() => setFindOpen((v) => !v)}
            >
              {t('find')}
            </button>
            <span className="data-len" title="dataLength">
              {dataLength} B
            </span>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!editorDirty}
              onClick={() => void saveData()}
            >
              {t('saveData')}
              {editorDirty ? ' *' : ''}
            </button>
          </>
        )}
        {tab === 'acl' && (
          <button className="btn btn-primary" type="button" onClick={() => void saveAcl()}>
            {t('save')}
          </button>
        )}
        <button className="btn" type="button" onClick={() => void refresh()}>
          Refresh
        </button>
        <button className="btn" type="button" onClick={() => setCreateOpen(true)}>
          {t('createNode')}
        </button>
        <button className="btn btn-danger" type="button" onClick={() => void remove(false)}>
          {t('deleteNode')}
        </button>
        <button className="btn btn-danger" type="button" onClick={() => void remove(true)}>
          {t('recursiveDelete')}
        </button>
      </div>

      {tab === 'data' && findOpen && (
        <div className="find-bar">
          <input
            className="input"
            autoFocus
            placeholder={t('findPlaceholder')}
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value)
              setFindIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const matches = collectMatchIndexes(displayText, findQuery)
                if (matches.length === 0) {
                  setFindCount(0)
                  return
                }
                const next = e.shiftKey ? findIndex - 1 : findCount === 0 ? 0 : findIndex + 1
                applyFind(next)
              }
            }}
          />
          <span className="find-count">
            {findQuery ? (findCount === 0 ? '0/0' : `${findIndex + 1}/${findCount}`) : '—'}
          </span>
          <button
            className="btn"
            type="button"
            disabled={!findQuery || findCount === 0}
            onClick={() => applyFind(findIndex - 1)}
          >
            ↑
          </button>
          <button
            className="btn"
            type="button"
            disabled={!findQuery || findCount === 0}
            onClick={() => applyFind(findIndex + 1)}
          >
            ↓
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setFindOpen(false)}>
            ✕
          </button>
        </div>
      )}

      <div className="editor-body">
        {tab === 'data' &&
          (usePlainEditor ? (
            <textarea
              ref={textareaRef}
              className="raw-editor"
              value={displayText}
              spellCheck={false}
              onChange={(e) => onUserEdit(e.target.value)}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
            />
          ) : (
            <Editor
              key={`${selectedPath}:${viewFormat}`}
              height="100%"
              language={editorLanguage}
              theme={settings.theme === 'dark' ? 'vs-dark' : 'light'}
              value={displayText}
              loading={<div className="editor-loading">Loading editor…</div>}
              onMount={onMonacoMount}
              onChange={(v) => onUserEdit(v ?? '')}
              options={{
                fontFamily: 'JetBrains Mono, Consolas, monospace',
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never' },
              }}
            />
          ))}
        {tab === 'meta' && (
          <dl className="meta-grid">
            {Object.entries(nodeData.stat).map(([k, v]) => {
              let display = String(v)
              if ((k === 'ctime' || k === 'mtime') && typeof v === 'number' && v > 0) {
                display = `${new Date(v).toISOString()} (${v})`
              }
              return (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{display}</dd>
                </div>
              )
            })}
          </dl>
        )}
        {tab === 'acl' && (
          <div style={{ padding: 12, overflow: 'auto', height: '100%' }}>
            <table className="acl-table">
              <thead>
                <tr>
                  <th>scheme</th>
                  <th>id</th>
                  <th>perms</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(aclDraft.length ? aclDraft : nodeData.acls).map((a, idx) => (
                  <tr key={`${a.scheme}-${a.id}-${idx}`}>
                    <td>
                      <input
                        className="input"
                        value={a.scheme}
                        onChange={(e) => {
                          const next = [...(aclDraft.length ? aclDraft : nodeData.acls)]
                          next[idx] = { ...next[idx], scheme: e.target.value }
                          setAclDraft(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={a.id}
                        onChange={(e) => {
                          const next = [...(aclDraft.length ? aclDraft : nodeData.acls)]
                          next[idx] = { ...next[idx], id: e.target.value }
                          setAclDraft(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        value={a.perms}
                        onChange={(e) => {
                          const next = [...(aclDraft.length ? aclDraft : nodeData.acls)]
                          next[idx] = { ...next[idx], perms: Number(e.target.value) }
                          setAclDraft(next)
                        }}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          const base = aclDraft.length ? aclDraft : nodeData.acls
                          setAclDraft(base.filter((_, i) => i !== idx))
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="btn"
              type="button"
              style={{ marginTop: 8 }}
              onClick={() =>
                setAclDraft([
                  ...(aclDraft.length ? aclDraft : nodeData.acls),
                  { scheme: 'world', id: 'anyone', perms: PERM.ALL },
                ])
              }
            >
              + ACL
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{t('createNode')}</h2>
            <div className="form-grid">
              <div className="form-row">
                <label>{t('path')}</label>
                <input
                  className="input"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="relative or /absolute"
                />
              </div>
              <div className="form-row">
                <label>{t('data')}</label>
                <textarea
                  className="input"
                  rows={4}
                  value={newData}
                  onChange={(e) => setNewData(e.target.value)}
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={ephemeral}
                  onChange={(e) => setEphemeral(e.target.checked)}
                />
                {t('ephemeral')}
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={sequential}
                  onChange={(e) => setSequential(e.target.checked)}
                />
                {t('sequential')}
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" type="button" onClick={() => setCreateOpen(false)}>
                {t('cancel')}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void create()}>
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
