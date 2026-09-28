import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'

type Props = { onBackHome?: () => void }

export function TopBar({ onBackHome }: Props) {
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
  const status = activeId ? statuses[activeId] : undefined
  const profile = profiles.find((p) => p.id === activeId)

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
            <span className="breadcrumb-server">{profile?.name ?? ''}</span>
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
