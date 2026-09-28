import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import { TerminalPane } from '../terminal/TerminalPane'
import { MonitorPane } from '../monitor/MonitorPane'
import { LogsPane } from '../logs/LogsPane'
import { FourLetterPane } from '../monitor/FourLetterPane'

export function BottomDrawer() {
  const { t } = useTranslation()
  const bottomOpen = useAppStore((s) => s.bottomOpen)
  const bottomTab = useAppStore((s) => s.bottomTab)
  const setBottomOpen = useAppStore((s) => s.setBottomOpen)
  const setBottomTab = useAppStore((s) => s.setBottomTab)
  const activeId = useAppStore((s) => s.activeId)

  const tabs = [
    { id: 'terminal' as const, label: t('terminal') },
    { id: 'monitor' as const, label: t('monitor') },
    { id: 'fourletter' as const, label: t('fourLetter') },
    { id: 'logs' as const, label: t('logs') },
  ]

  return (
    <div className={`bottom-drawer ${bottomOpen ? 'expanded' : 'collapsed'}`}>
      <div className="bottom-header">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${bottomTab === tab.id ? 'active' : ''}`}
            onClick={() => {
              setBottomTab(tab.id)
              setBottomOpen(true)
            }}
          >
            {tab.label}
          </button>
        ))}
        <button
          className="btn btn-ghost"
          type="button"
          style={{ marginLeft: 'auto' }}
          onClick={() => setBottomOpen(!bottomOpen)}
        >
          {bottomOpen ? '▾' : '▴'}
        </button>
      </div>
      {bottomOpen && (
        <div className="bottom-body">
          {!activeId && bottomTab !== 'logs' ? (
            <div className="empty-state">{t('noConnection')}</div>
          ) : (
            <>
              {bottomTab === 'terminal' && <TerminalPane />}
              {bottomTab === 'monitor' && <MonitorPane />}
              {bottomTab === 'fourletter' && <FourLetterPane />}
              {bottomTab === 'logs' && <LogsPane />}
            </>
          )}
        </div>
      )}
    </div>
  )
}
