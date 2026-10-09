import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import type { ConnectionProfile, ZkChildNode } from '../types'

type Props = {
  onBackHome: () => void
  onSwitch: (p: ConnectionProfile) => void
}

function TreeItem({
  path,
  name,
  depth,
}: {
  path: string
  name: string
  depth: number
}) {
  const {
    activeId,
    tree,
    expanded,
    selectedPath,
    setExpanded,
    setChildren,
    setSelectedPath,
    setNodeData,
    setDraft,
    setDirty,
    setError,
    dirty,
  } = useStore()
  const kids = tree[path]
  const open = !!expanded[path]

  async function toggle() {
    if (!activeId) return
    const next = !open
    setExpanded(path, next)
    if (next && !kids) {
      try {
        setChildren(path, await api.listChildren(activeId, path))
      } catch (e) {
        setError(String(e))
      }
    }
  }

  async function select() {
    if (!activeId) return
    if (dirty && !confirm('有未保存修改，是否丢弃？')) return
    setSelectedPath(path)
    try {
      const data = await api.getData(activeId, path)
      setNodeData(data)
      setDraft(data.data ?? '')
      setDirty(false)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div>
      <div
        className={`tree-node ${selectedPath === path ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => void select()}
      >
        <button
          type="button"
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation()
            void toggle()
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <span>{name || '/'}</span>
      </div>
      {open &&
        (kids ?? []).map((c: ZkChildNode) => (
          <TreeItem key={c.path} path={c.path} name={c.name} depth={depth + 1} />
        ))}
    </div>
  )
}

export function Workspace({ onBackHome, onSwitch }: Props) {
  const {
    activeId,
    profiles,
    statuses,
    selectedPath,
    nodeData,
    draft,
    dirty,
    setDraft,
    setDirty,
    setNodeData,
    setError,
  } = useStore()
  const profile = profiles.find((p) => p.id === activeId)
  const status = activeId ? statuses[activeId] : undefined
  const [switchOpen, setSwitchOpen] = useState(false)
  const switchRef = useRef<HTMLDivElement>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newData, setNewData] = useState('')

  useEffect(() => {
    if (!switchOpen) return
    const onDown = (e: MouseEvent) => {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) setSwitchOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [switchOpen])

  async function save() {
    if (!activeId || !nodeData) return
    try {
      const stat = await api.setData(activeId, selectedPath, draft, nodeData.stat.version)
      setNodeData({ ...nodeData, data: draft, stat })
      setDirty(false)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function refresh() {
    if (!activeId) return
    try {
      const data = await api.getData(activeId, selectedPath)
      setNodeData(data)
      setDraft(data.data ?? '')
      setDirty(false)
    } catch (e) {
      setError(String(e))
    }
  }

  async function remove(recursive: boolean) {
    if (!activeId || selectedPath === '/') return
    if (!confirm(recursive ? '递归删除该节点？' : '删除该节点？')) return
    try {
      await api.deleteNode(activeId, selectedPath, recursive)
      onSwitch(profile!)
    } catch (e) {
      setError(String(e))
    }
  }

  async function create() {
    if (!activeId || !newPath.trim()) return
    const full = newPath.startsWith('/')
      ? newPath
      : selectedPath === '/'
        ? `/${newPath}`
        : `${selectedPath}/${newPath}`
    try {
      await api.createNode(activeId, full, newData, false, false)
      setCreateOpen(false)
      setNewPath('')
      setNewData('')
      await refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost" type="button" onClick={onBackHome}>
          ←
        </button>
        <div className="breadcrumb">
          <span className={`status-dot ${status ?? 'disconnected'}`} style={{ marginRight: 8 }} />
          <div className="connection-switcher" ref={switchRef}>
            <button
              type="button"
              className="breadcrumb-server connection-switcher-btn"
              onClick={() => setSwitchOpen((v) => !v)}
            >
              <span>{profile?.name ?? ''}</span>
              <span className="connection-switcher-caret">▾</span>
            </button>
            {switchOpen && (
              <ul className="connection-switcher-menu">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`connection-switcher-item ${p.id === activeId ? 'active' : ''}`}
                      onClick={() => {
                        setSwitchOpen(false)
                        if (p.id !== activeId) onSwitch(p)
                      }}
                    >
                      <span className={`status-dot ${statuses[p.id] ?? 'disconnected'}`} />
                      <span className="connection-switcher-item-body">
                        <span className="connection-switcher-item-name">{p.name}</span>
                        <span className="connection-switcher-item-meta">
                          {p.host}:{p.port}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-path">{selectedPath}</span>
        </div>
        {dirty && <span className="dirty-pill">未保存</span>}
      </header>

      <div className="main-pane">
        <aside className="tree-pane">
          <TreeItem path="/" name="/" depth={0} />
        </aside>
        <section className="editor-pane">
          <div className="editor-toolbar">
            <button className="btn btn-primary" type="button" disabled={!dirty} onClick={() => void save()}>
              保存
            </button>
            <button className="btn" type="button" onClick={() => void refresh()}>
              刷新
            </button>
            <button className="btn" type="button" onClick={() => setCreateOpen(true)}>
              新建节点
            </button>
            <button className="btn btn-danger" type="button" disabled={selectedPath === '/'} onClick={() => void remove(false)}>
              删除
            </button>
            <button className="btn btn-danger" type="button" disabled={selectedPath === '/'} onClick={() => void remove(true)}>
              递归删除
            </button>
          </div>
          <div className="editor-body">
            <textarea
              className="raw-editor"
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value)
                setDirty(e.target.value !== (nodeData?.data ?? ''))
              }}
            />
          </div>
          {nodeData && (
            <div className="meta-strip">
              version={nodeData.stat.version} · children={nodeData.stat.numChildren} · len=
              {nodeData.stat.dataLength} · mtime={new Date(nodeData.stat.mtime).toLocaleString()}
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>新建节点</h2>
            <div className="form-row">
              <label>路径</label>
              <input className="input" value={newPath} placeholder="相对或绝对路径" onChange={(e) => setNewPath(e.target.value)} />
            </div>
            <div className="form-row">
              <label>数据</label>
              <textarea className="input" rows={4} value={newData} onChange={(e) => setNewData(e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn" type="button" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void create()}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
