import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'

type Props = {
  showHome: boolean
  onNew: () => void
  onOpenSettings: () => void
  onShowHome: () => void
}

export function IconNav({ showHome, onNew, onOpenSettings, onShowHome }: Props) {
  const { t } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)

  async function toggleTheme() {
    const theme = settings.theme === 'dark' ? 'light' : 'dark'
    const next = await window.yizoo.settings.set({ theme })
    setSettings(next)
    document.documentElement.dataset.theme = next.theme
  }

  return (
    <nav className="icon-nav" aria-label="main">
      <button type="button" className="icon-nav-brand" onClick={onShowHome} title={t('brand')}>
        YI
      </button>
      <button type="button" className="icon-btn" onClick={onNew} title={t('newConnection')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </button>
      <button
        type="button"
        className={`icon-btn ${showHome ? 'active' : ''}`}
        onClick={onShowHome}
        title={t('connections')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>
      <div className="icon-nav-spacer" />
      <button type="button" className="icon-btn" onClick={() => void toggleTheme()} title={t('theme')}>
        {settings.theme === 'dark' ? (
          /* sun — switch to light */
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          /* moon — switch to dark */
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
          </svg>
        )}
      </button>
      <button type="button" className="icon-btn" onClick={onOpenSettings} title={t('settings')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </nav>
  )
}
