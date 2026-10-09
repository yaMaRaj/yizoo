import { useState } from 'react'
import { api } from '../api'
import type { ConnectionProfile } from '../types'

type Props = {
  initial: ConnectionProfile | null
  onClose: () => void
  onSaved: () => void
}

export function ConnectionForm({ initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ConnectionProfile>(
    initial ?? {
      id: '',
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
      createdAt: 0,
      updatedAt: 0,
    },
  )
  const [portText, setPortText] = useState(String(initial?.port ?? 2181))
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const port = Number(portText)
    if (!form.name.trim() || !form.host.trim()) {
      setError('请填写名称与主机')
      return
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('端口需为 1–65535')
      return
    }
    try {
      await api.saveConnection({ ...form, port })
      onSaved()
      onClose()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog">
        <h2>{initial ? '编辑连接' : '新建连接'}</h2>
        <div className="form-grid">
          <div className="form-row">
            <label>名称</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>主机</label>
            <input
              className="input"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>端口</label>
            <input className="input" value={portText} onChange={(e) => setPortText(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          </div>
          <div className="form-row">
            <label>认证 scheme</label>
            <input
              className="input"
              value={form.auth?.scheme ?? ''}
              onChange={(e) => setForm({ ...form, auth: { ...form.auth, scheme: e.target.value, auth: form.auth?.auth ?? '' } })}
            />
          </div>
          <div className="form-row">
            <label>认证信息</label>
            <input
              className="input"
              value={form.auth?.auth ?? ''}
              onChange={(e) => setForm({ ...form, auth: { ...form.auth, scheme: form.auth?.scheme ?? '', auth: e.target.value } })}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={!!form.ssh?.enabled}
              onChange={(e) =>
                setForm({
                  ...form,
                  ssh: { ...(form.ssh ?? { host: '', port: 22, username: '' }), enabled: e.target.checked },
                })
              }
            />
            SSH 隧道
          </label>
          {form.ssh?.enabled && (
            <>
              <div className="form-row">
                <label>SSH 主机</label>
                <input
                  className="input"
                  value={form.ssh.host}
                  onChange={(e) => setForm({ ...form, ssh: { ...form.ssh!, host: e.target.value } })}
                />
              </div>
              <div className="form-row">
                <label>SSH 用户</label>
                <input
                  className="input"
                  value={form.ssh.username}
                  onChange={(e) => setForm({ ...form, ssh: { ...form.ssh!, username: e.target.value } })}
                />
              </div>
              <div className="form-row">
                <label>SSH 密码</label>
                <input
                  className="input"
                  type="password"
                  value={form.ssh.password ?? ''}
                  onChange={(e) => setForm({ ...form, ssh: { ...form.ssh!, password: e.target.value } })}
                />
              </div>
            </>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
