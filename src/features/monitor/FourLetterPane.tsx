import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'

const COMMANDS = ['ruok', 'srvr', 'mntr', 'stat', 'conf', 'envi', 'cons', 'wchs', 'dump']

export function FourLetterPane() {
  const { t } = useTranslation()
  const activeId = useAppStore((s) => s.activeId)
  const [cmd, setCmd] = useState('mntr')
  const [out, setOut] = useState('')

  useEffect(() => {
    setOut('')
  }, [activeId])

  async function run() {
    if (!activeId) return
    const id = activeId
    try {
      const text = await window.yizoo.zk.fourLetter(id, cmd)
      if (useAppStore.getState().activeId !== id) return
      setOut(text || '(empty)')
    } catch (err) {
      if (useAppStore.getState().activeId !== id) return
      setOut(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="fourletter-pane">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {COMMANDS.map((c) => (
          <button
            key={c}
            type="button"
            className={`btn ${cmd === c ? 'btn-primary' : ''}`}
            onClick={() => setCmd(c)}
          >
            {c}
          </button>
        ))}
        <button className="btn btn-primary" type="button" onClick={() => void run()}>
          {t('run')}
        </button>
      </div>
      <pre className="fourletter-out">{out}</pre>
    </div>
  )
}
