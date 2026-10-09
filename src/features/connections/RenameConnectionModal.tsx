import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectionProfile } from '@shared/types'
import { useAppStore } from '../../store/app-store'

type Props = {
  profile: ConnectionProfile
  onClose: () => void
}

export function RenameConnectionModal({ profile, onClose }: Props) {
  const { t } = useTranslation()
  const setProfiles = useAppStore((s) => s.setProfiles)
  const setError = useAppStore((s) => s.setError)
  const [name, setName] = useState(profile.name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleSave() {
    const next = name.trim()
    if (!next) {
      setError(t('nameRequired'))
      return
    }
    if (next === profile.name) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const latest = (await window.yizoo.connections.list()).find((p) => p.id === profile.id)
      if (!latest) {
        setError(t('connectionNotFound'))
        return
      }
      await window.yizoo.connections.save({ ...latest, name: next })
      setProfiles(await window.yizoo.connections.list())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
        <h2 id="rename-title">{t('renameConnection')}</h2>
        <div className="form-row">
          <label htmlFor="rename-connection-name">{t('name')}</label>
          <input
            id="rename-connection-name"
            ref={inputRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSave()
              }
              if (e.key === 'Escape') onClose()
            }}
          />
        </div>
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
