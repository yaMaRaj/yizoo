import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import type { ConnectionProfile } from '@shared/types'

type Props = {
  onBackHome?: () => void
  onSwitchConnection: (profile: ConnectionProfile) => void
}

export function TopBar({ onBackHome, onSwitchConnection }: Props) {
  const { t } = useTranslation()
  const {
    activeId,
    selectedPath,
    statuses,
    searchResults,
    setSearchResults,
    setSelectedPath,
    setError,
    profiles,
  } = useAppStore()
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const switchRef = useRef<HTMLDivElement>(null)
  const status = activeId ? statuses[activeId] : undefined
  const profile = profiles.find((p) => p.id === activeId)

  useEffect(() => {
    if (!switchOpen) return
    const onDown = (e: MouseEvent) => {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) {
        setSwitchOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSwitchOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [switchOpen])

  async function runSearch() {
    if (!activeId || !keyword.trim()) return
    setSearching(true)
    setSearched(true)
    setError(null)
    try {
      const paths = await window.yizoo.zk.search(activeId, '/', keyword.trim(), 100)
      setSearchResults(paths)
    } catch (err) {
      setSearchResults([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  return (
    <header className="topbar">
      {onBackHome && (
        <button className="btn btn-ghost" type="button" onClick={onBackHome} title={t('connections')}>
          ←
        </button>
      )}
      <div className="breadcrumb">
        {activeId ? (
          <>
            <span
              className={`status-dot ${status ?? 'disconnected'}`}
              style={{ display: 'inline-block', marginRight: 8 }}
            />
            <div className="connection-switcher" ref={switchRef}>
              <button
                type="button"
                className="breadcrumb-server connection-switcher-btn"
                title={t('switchConnection')}
                aria-expanded={switchOpen}
                aria-haspopup="listbox"
                onClick={() => setSwitchOpen((v) => !v)}
              >
                <span>{profile?.name ?? ''}</span>
                <span className="connection-switcher-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {switchOpen && (
                <ul className="connection-switcher-menu" role="listbox">
                  {profiles.map((p) => {
                    const st = statuses[p.id] ?? 'disconnected'
                    const active = p.id === activeId
                    return (
                      <li key={p.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          className={`connection-switcher-item ${active ? 'active' : ''}`}
                          onClick={() => {
                            setSwitchOpen(false)
                            if (p.id === activeId) return
                            onSwitchConnection(p)
                          }}
                        >
                          <span className={`status-dot ${st}`} />
                          <span className="connection-switcher-item-body">
                            <span className="connection-switcher-item-name">{p.name}</span>
                            <span className="connection-switcher-item-meta">
                              {p.host}:{p.port}
                              {st === 'connected' ? '' : ` · ${st}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-path">{selectedPath}</span>
          </>
        ) : (
          t('noConnection')
        )}
      </div>
      {activeId && (
        <div className="search-box">
          <input
            className="input"
            style={{ width: 200 }}
            placeholder={t('search')}
            value={keyword}
            disabled={searching}
            onChange={(e) => {
              setKeyword(e.target.value)
              setSearched(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
            }}
          />
          <button
            className="btn"
            type="button"
            disabled={searching || !keyword.trim()}
            onClick={() => void runSearch()}
          >
            {searching ? '…' : t('search')}
          </button>
          {(searched || searchResults.length > 0) && (
            <div className="search-popover">
              {searching ? (
                <div className="search-empty">{t('searching')}</div>
              ) : searchResults.length === 0 ? (
                <div className="search-empty">{t('searchEmpty')}</div>
              ) : (
                <ul className="search-results">
                  {searchResults.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPath(p)
                          setSearchResults([])
                          setSearched(false)
                          window.dispatchEvent(new CustomEvent('yizoo:select-path', { detail: p }))
                        }}
                      >
                        {p}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  )
}
