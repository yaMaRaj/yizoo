import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'

export function LogsPane() {
  const { t } = useTranslation()
  const logs = useAppStore((s) => s.logs)
  const setLogs = useAppStore((s) => s.setLogs)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 12px' }}>
        <button
          className="btn"
          type="button"
          onClick={() => {
            void window.yizoo.logs.clear().then(() => setLogs([]))
          }}
        >
          {t('clearLogs')}
        </button>
      </div>
      <ul className="log-list">
        {logs.map((l) => (
          <li key={l.id} className={`log-item ${l.level}`}>
            {new Date(l.ts).toLocaleTimeString()} [{l.level}] {l.source}: {l.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
