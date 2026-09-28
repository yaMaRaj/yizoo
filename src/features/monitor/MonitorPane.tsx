import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 200
  const h = 36
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline fill="none" stroke="#0f6e56" strokeWidth="2" points={points} />
    </svg>
  )
}

export function MonitorPane() {
  const { t } = useTranslation()
  const activeId = useAppStore((s) => s.activeId)
  const samples = useAppStore((s) => s.monitorSamples)
  const alerts = useAppStore((s) => s.monitorAlerts)
  const [history, setHistory] = useState<Record<string, number[]>>({})

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    void (async () => {
      const next: Record<string, number[]> = {}
      for (const s of samples) {
        const key = `${s.host}:${s.port}`
        const hist = await window.yizoo.monitor.getHistory(activeId, key)
        if (!cancelled) {
          next[key] = hist
            .map((h) => h.latencyAvg ?? 0)
            .filter((n) => Number.isFinite(n))
        }
      }
      if (!cancelled) setHistory(next)
    })()
    return () => {
      cancelled = true
    }
  }, [activeId, samples])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', height: '100%' }}>
      <div className="monitor-grid">
        {samples.length === 0 && <div className="empty-state">Waiting for samples…</div>}
        {samples.map((s) => {
          const key = `${s.host}:${s.port}`
          return (
            <div key={key} className="monitor-card">
              <h3>
                <span className={`status-dot ${s.ruok ? 'connected' : 'error'}`} style={{ display: 'inline-block', marginRight: 8 }} />
                {key}
              </h3>
              <div className="metric-row">
                <span>{t('healthy')}</span>
                <strong>{s.ruok ? t('healthy') : t('unhealthy')}</strong>
              </div>
              <div className="metric-row">
                <span>{t('mode')}</span>
                <strong>{s.mode ?? '—'}</strong>
              </div>
              <div className="metric-row">
                <span>{t('latency')}</span>
                <strong>{s.latencyAvg ?? '—'} ms</strong>
              </div>
              <div className="metric-row">
                <span>{t('connectionsCount')}</span>
                <strong>{s.numAliveConnections ?? '—'}</strong>
              </div>
              <div className="metric-row">
                <span>{t('znodes')}</span>
                <strong>{s.znodeCount ?? '—'}</strong>
              </div>
              <div className="metric-row">
                <span>{t('watches')}</span>
                <strong>{s.watchCount ?? '—'}</strong>
              </div>
              <div className="metric-row">
                <span>zxid</span>
                <strong>{s.zxid ?? '—'}</strong>
              </div>
              {s.error && (
                <div className="metric-row" style={{ color: 'var(--danger)' }}>
                  {s.error}
                </div>
              )}
              <Sparkline values={history[key] ?? []} />
            </div>
          )
        })}
      </div>
      <ul className="alert-list">
        <li style={{ fontWeight: 600, marginBottom: 6 }}>{t('alerts')}</li>
        {alerts.length === 0 && <li className="alert-item">—</li>}
        {alerts.slice(0, 30).map((a) => (
          <li key={a.id} className={`alert-item ${a.severity}`}>
            {new Date(a.ts).toLocaleTimeString()} · {a.host}: {a.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
