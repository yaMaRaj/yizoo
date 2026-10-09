import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'

type Props = { onClose: () => void }

export function SettingsModal({ onClose }: Props) {
  const { t, i18n } = useTranslation()
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)

  async function update(patch: Partial<typeof settings>) {
    const next = await window.yizoo.settings.set(patch)
    setSettings(next)
    if (patch.locale) void i18n.changeLanguage(patch.locale)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{t('settings')}</h2>
        <div className="form-grid">
          <div className="form-row">
            <label>{t('language')}</label>
            <select
              className="input"
              value={settings.locale}
              onChange={(e) => void update({ locale: e.target.value as 'zh' | 'en' })}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="form-row">
            <label>{t('fontSize')}</label>
            <input
              className="input"
              type="range"
              min={12}
              max={20}
              value={settings.fontSize}
              onChange={(e) => void update({ fontSize: Number(e.target.value) })}
            />
            <span>{settings.fontSize}px</span>
          </div>
          <div className="form-row">
            <label>Monitor interval (ms)</label>
            <input
              className="input"
              type="number"
              value={settings.monitorIntervalMs}
              onChange={(e) => void update({ monitorIntervalMs: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
