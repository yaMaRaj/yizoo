import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectionProfile } from '@shared/types'
import { useAppStore } from '../../store/app-store'
import { askConfirm } from '../../components/confirm-store'

type Props = {
  initial: ConnectionProfile | null
  onClose: () => void
}

function digitsOnly(raw: string, maxLen = 5): string {
  return raw.replace(/\D/g, '').slice(0, maxLen)
}

function parsePort(text: string): number | null {
  if (!text) return null
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null
  return n
}

export function ConnectionFormModal({ initial, onClose }: Props) {
  const { t } = useTranslation()
  const setProfiles = useAppStore((s) => s.setProfiles)
  const setError = useAppStore((s) => s.setError)
  const activeId = useAppStore((s) => s.activeId)
  const setActiveId = useAppStore((s) => s.setActiveId)
  const setNodeData = useAppStore((s) => s.setNodeData)
  const setEditorDraft = useAppStore((s) => s.setEditorDraft)
  const setEditorDirty = useAppStore((s) => s.setEditorDirty)
  const [form, setForm] = useState<ConnectionProfile>(
    initial ?? {
      id: crypto.randomUUID(),
      name: '',
      host: '127.0.0.1',
      port: 2181,
      connectionTimeoutMs: 15000,
      sessionTimeoutMs: 30000,
      ssh: {
        enabled: false,
        host: '',
        port: 22,
        username: '',
        password: '',
        privateKeyPath: '',
        passphrase: '',
      },
      auth: { scheme: '', auth: '' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  )
  const [portText, setPortText] = useState(String(initial?.port ?? 2181))
  const [sshPortText, setSshPortText] = useState(String(initial?.ssh?.port ?? 22))

  function patch<K extends keyof ConnectionProfile>(key: K, value: ConnectionProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.host.trim()) return
    const port = parsePort(portText)
    if (port == null) {
      setError(t('portInvalid'))
      return
    }
    let sshPort = form.ssh?.port ?? 22
    if (form.ssh?.enabled) {
      const sp = parsePort(sshPortText)
      if (sp == null) {
        setError(t('portInvalid'))
        return
      }
      sshPort = sp
    }
    const payload: ConnectionProfile = {
      ...form,
      port,
      ssh: form.ssh ? { ...form.ssh, port: sshPort } : form.ssh,
    }
    try {
      await window.yizoo.connections.save(payload)
      setProfiles(await window.yizoo.connections.list())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete() {
    if (!initial) return
    const ok = await askConfirm({
      title: t('brand'),
      message: t('confirmDeleteConnection', { name: initial.name }),
      confirmLabel: t('ok'),
      cancelLabel: t('cancel'),
      danger: true,
    })
    if (!ok) return
    try {
      await window.yizoo.connections.remove(initial.id)
      setProfiles(await window.yizoo.connections.list())
      if (activeId === initial.id) {
        setActiveId(null)
        setNodeData(null)
        setEditorDraft('')
        setEditorDirty(false)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{initial ? t('editConnection') : t('newConnection')}</h2>
        <div className="form-grid">
          <div className="form-row">
            <label>{t('name')}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>{t('host')}</label>
            <input
              className="input"
              value={form.host}
              onChange={(e) => patch('host', e.target.value)}
              placeholder="zk1:2181,zk2:2181 or 127.0.0.1"
            />
          </div>
          <div className="form-row">
            <label>{t('port')}</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="2181"
              value={portText}
              onChange={(e) => setPortText(digitsOnly(e.target.value))}
            />
          </div>
          <div className="form-row">
            <label>{t('timeout')}</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={String(form.connectionTimeoutMs || '')}
              onChange={(e) => {
                const d = digitsOnly(e.target.value, 8)
                patch('connectionTimeoutMs', d ? Number(d) : 0)
              }}
            />
          </div>
          <div className="form-row">
            <label>{t('sessionTimeout')}</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={String(form.sessionTimeoutMs || '')}
              onChange={(e) => {
                const d = digitsOnly(e.target.value, 8)
                patch('sessionTimeoutMs', d ? Number(d) : 0)
              }}
            />
          </div>
          <div className="form-row">
            <label>{t('authScheme')}</label>
            <input
              className="input"
              value={form.auth?.scheme ?? ''}
              onChange={(e) =>
                patch('auth', { scheme: e.target.value, auth: form.auth?.auth ?? '' })
              }
              placeholder="digest"
            />
          </div>
          <div className="form-row">
            <label>{t('authInfo')}</label>
            <input
              className="input"
              value={form.auth?.auth ?? ''}
              onChange={(e) =>
                patch('auth', { scheme: form.auth?.scheme ?? 'digest', auth: e.target.value })
              }
              placeholder="user:pass"
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={!!form.ssh?.enabled}
              onChange={(e) =>
                patch('ssh', {
                  ...(form.ssh ?? {
                    enabled: false,
                    host: '',
                    port: 22,
                    username: '',
                  }),
                  enabled: e.target.checked,
                })
              }
            />
            {t('ssh')}
          </label>

          {form.ssh?.enabled && (
            <>
              <div className="form-row">
                <label>SSH {t('host')}</label>
                <input
                  className="input"
                  value={form.ssh.host}
                  onChange={(e) => patch('ssh', { ...form.ssh!, host: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>SSH {t('port')}</label>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="22"
                  value={sshPortText}
                  onChange={(e) => setSshPortText(digitsOnly(e.target.value))}
                />
              </div>
              <div className="form-row">
                <label>{t('username')}</label>
                <input
                  className="input"
                  value={form.ssh.username}
                  onChange={(e) => patch('ssh', { ...form.ssh!, username: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>{t('password')}</label>
                <input
                  className="input"
                  type="password"
                  value={form.ssh.password ?? ''}
                  onChange={(e) => patch('ssh', { ...form.ssh!, password: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>{t('privateKey')}</label>
                <input
                  className="input"
                  value={form.ssh.privateKeyPath ?? ''}
                  onChange={(e) =>
                    patch('ssh', { ...form.ssh!, privateKeyPath: e.target.value })
                  }
                />
              </div>
              <div className="form-row">
                <label>{t('passphrase')}</label>
                <input
                  className="input"
                  type="password"
                  value={form.ssh.passphrase ?? ''}
                  onChange={(e) => patch('ssh', { ...form.ssh!, passphrase: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
        <div className="form-actions">
          {initial && (
            <button className="btn btn-danger" type="button" onClick={() => void handleDelete()}>
              {t('delete')}
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void handleSave()}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
