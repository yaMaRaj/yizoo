import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import type { ConnectionProfile } from '../types'

type Props = {
  onConnect: (p: ConnectionProfile) => void
  onEdit: (p: ConnectionProfile) => void
  onRefresh: () => void
}

type Menu = { x: number; y: number; profile: ConnectionProfile } | null

export function ConnectionBoard({ onConnect, onEdit, onRefresh }: Props) {
  const profiles = useStore((s) => s.profiles)
  const statuses = useStore((s) => s.statuses)
  const setError = useStore((s) => s.setError)
  const [menu, setMenu] = useState<Menu>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  async function duplicate(p: ConnectionProfile) {
    setMenu(null)
    try {
      await api.duplicateConnection(p.id)
      onRefresh()
    } catch (e) {
      setError(String(e))
    }
  }

  async function remove(p: ConnectionProfile) {
    setMenu(null)
    if (!confirm(`删除连接「${p.name}」？`)) return
    try {
      await api.removeConnection(p.id)
      onRefresh()
    } catch (e) {
      setError(String(e))
    }
  }

  async function saveRename() {
    if (!renameId || !renameValue.trim()) return
    try {
      await api.renameConnection(renameId, renameValue.trim())
      setRenameId(null)
      onRefresh()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="connection-board">
      <header className="connection-board-header">
        <div>
          <div className="brand-name">YIZoo</div>
          <div className="brand-tag">ZooKeeper 工作台 · Wails / Go</div>
        </div>
      </header>

      {profiles.length === 0 ? (
        <div className="empty-state">
          <p>选择或新建一个连接开始</p>
        </div>
      ) : (
        <ul className="connection-cards">
          {profiles.map((p) => {
            const st = statuses[p.id] ?? 'disconnected'
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`connection-card ${st}`}
                  onClick={() => onConnect(p)}
                  onDoubleClick={() => onEdit(p)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, profile: p })
                  }}
                >
                  <span className={`status-dot ${st}`} />
                  <span className="connection-card-body">
                    <span className="connection-name">{p.name}</span>
                    <span className="connection-addr">
                      {p.host}:{p.port}
                      {p.ssh?.enabled ? ' · SSH' : ''}
                    </span>
                    <span className="connection-status-text">{st}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {menu && (
        <div ref={menuRef} className="ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(null); onConnect(menu.profile) }}>
            连接
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); onEdit(menu.profile) }}>
            编辑
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setRenameId(menu.profile.id)
              setRenameValue(menu.profile.name)
              setMenu(null)
            }}
          >
            重命名
          </button>
          <button type="button" role="menuitem" onClick={() => void duplicate(menu.profile)}>
            复制配置
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => void remove(menu.profile)}>
            删除
          </button>
        </div>
      )}

      {renameId && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>重命名</h2>
            <div className="form-row">
              <label>名称</label>
              <input
                className="input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveRename()
                  if (e.key === 'Escape') setRenameId(null)
                }}
              />
            </div>
            <div className="form-actions">
              <button className="btn" type="button" onClick={() => setRenameId(null)}>
                取消
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void saveRename()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
