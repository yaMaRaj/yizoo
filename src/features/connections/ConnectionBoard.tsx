import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import type { ConnectionProfile, ConnectionStatus } from '@shared/types'
import { askConfirm } from '../../components/confirm-store'

type Props = {
  onEdit: (profile: ConnectionProfile) => void
  onConnect: (profile: ConnectionProfile) => void
}

type MenuState = {
  x: number
  y: number
  profile: ConnectionProfile
} | null

export function ConnectionBoard({ onEdit, onConnect }: Props) {
  const { t } = useTranslation()
  const profiles = useAppStore((s) => s.profiles)
  const statuses = useAppStore((s) => s.statuses)
  const activeId = useAppStore((s) => s.activeId)
  const setActiveId = useAppStore((s) => s.setActiveId)
  const setNodeData = useAppStore((s) => s.setNodeData)
  const setEditorDraft = useAppStore((s) => s.setEditorDraft)
  const setProfiles = useAppStore((s) => s.setProfiles)
  const [menu, setMenu] = useState<MenuState>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  async function handleDisconnect(id: string) {
    await window.yizoo.zk.disconnect(id)
    if (activeId === id) {
      setActiveId(null)
      setNodeData(null)
      setEditorDraft('')
    }
    setMenu(null)
  }

  async function handleDelete(profile: ConnectionProfile) {
    const status = statuses[profile.id] ?? 'disconnected'
    if (status === 'connected' || status === 'reconnecting') {
      await window.yizoo.zk.disconnect(profile.id)
    }
    const ok = await askConfirm({
      title: t('brand'),
      message: t('confirmDeleteConnection', { name: profile.name }),
      confirmLabel: t('ok'),
      cancelLabel: t('cancel'),
      danger: true,
    })
    if (!ok) return
    await window.yizoo.connections.remove(profile.id)
    setProfiles(await window.yizoo.connections.list())
    if (activeId === profile.id) {
      setActiveId(null)
      setNodeData(null)
      setEditorDraft('')
    }
    setMenu(null)
  }

  function statusLabel(status: ConnectionStatus): string {
    return status
  }

  return (
    <div className="connection-board">
      <header className="connection-board-header">
        <div>
          <div className="brand-name">{t('brand')}</div>
          <div className="brand-tag">{t('tagline')}</div>
        </div>
      </header>

      {profiles.length === 0 ? (
        <div className="empty-state">
          <p>{t('noConnection')}</p>
        </div>
      ) : (
        <ul className="connection-cards">
          {profiles.map((p) => {
            const status = statuses[p.id] ?? 'disconnected'
            const active = activeId === p.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`connection-card ${active ? 'active' : ''} ${status}`}
                  onClick={() => onConnect(p)}
                  onDoubleClick={() => onEdit(p)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, profile: p })
                  }}
                >
                  <span className={`status-dot ${status}`} />
                  <span className="connection-card-body">
                    <span className="connection-name">{p.name}</span>
                    <span className="connection-addr">
                      {p.host}:{p.port}
                      {p.ssh?.enabled ? ' · SSH' : ''}
                    </span>
                    <span className="connection-status-text">{statusLabel(status)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {(statuses[menu.profile.id] === 'connected' ||
            statuses[menu.profile.id] === 'reconnecting') ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleDisconnect(menu.profile.id)}
            >
              <span className="ctx-ico">■</span>
              {t('disconnect')}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null)
                onConnect(menu.profile)
              }}
            >
              <span className="ctx-ico">▶</span>
              {t('connect')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              onEdit(menu.profile)
            }}
          >
            <span className="ctx-ico">✎</span>
            {t('editConnection')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => void handleDelete(menu.profile)}
          >
            <span className="ctx-ico">🗑</span>
            {t('delete')}
          </button>
        </div>
      )}
    </div>
  )
}
