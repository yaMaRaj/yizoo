import { useEffect, useState } from 'react'
import { api } from './api'
import { useStore } from './store'
import type { ConnectionProfile } from './types'
import { ConnectionBoard } from './components/ConnectionBoard'
import { ConnectionForm } from './components/ConnectionForm'
import { Workspace } from './components/Workspace'

export function App() {
  const {
    showHome,
    setShowHome,
    setProfiles,
    setError,
    error,
    loading,
    setLoading,
    setActiveId,
    setStatus,
    resetTree,
    setDraft,
    setDirty,
    setNodeData,
    setChildren,
    setSelectedPath,
  } = useStore()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)

  async function refreshProfiles() {
    setProfiles(await api.listConnections())
  }

  useEffect(() => {
    void refreshProfiles().catch((e) => setError(String(e)))
  }, [])

  async function handleConnect(profile: ConnectionProfile) {
    setLoading(true)
    setError(null)
    try {
      await api.connect(profile.id)
      setActiveId(profile.id)
      setStatus(profile.id, 'connected')
      setShowHome(false)
      resetTree()
      setDirty(false)
      const kids = await api.listChildren(profile.id, '/')
      setChildren('/', kids)
      const data = await api.getData(profile.id, '/')
      setNodeData(data)
      setDraft(data.data ?? '')
      setSelectedPath('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus(profile.id, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="icon-nav">
        <button
          type="button"
          className="brand-mark"
          title="YIZoo"
          onClick={() => setShowHome(true)}
        >
          YI
        </button>
        <button
          type="button"
          className="icon-btn"
          title="新建连接"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          +
        </button>
        <div className="icon-nav-spacer" />
        <span className="icon-nav-badge">Go</span>
      </aside>

      <div className="workspace">
        {showHome ? (
          <ConnectionBoard
            onConnect={(p) => void handleConnect(p)}
            onEdit={(p) => {
              setEditing(p)
              setFormOpen(true)
            }}
            onRefresh={() => void refreshProfiles()}
          />
        ) : (
          <Workspace
            onBackHome={() => setShowHome(true)}
            onSwitch={(p) => void handleConnect(p)}
          />
        )}
      </div>

      {formOpen && (
        <ConnectionForm
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => void refreshProfiles()}
        />
      )}

      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      {loading && <div className="loading-overlay">连接中…</div>}
    </div>
  )
}
