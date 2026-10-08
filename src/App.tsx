import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from './store/app-store'
import { IconNav } from './features/connections/IconNav'
import { ConnectionBoard } from './features/connections/ConnectionBoard'
import { ConnectionFormModal } from './features/connections/ConnectionFormModal'
import { SettingsModal } from './features/settings/SettingsModal'
import { TopBar } from './features/workspace/TopBar'
import { NodeTree } from './features/nodes/NodeTree'
import { DataEditor } from './features/editor/DataEditor'
import { BottomDrawer } from './features/workspace/BottomDrawer'
import { ConfirmDialog } from './components/ConfirmDialog'
import { askConfirm } from './components/confirm-store'
import type { ConnectionProfile } from '@shared/types'

export function App() {
  const { t, i18n } = useTranslation()
  const {
    setProfiles,
    setStatus,
    setLogs,
    pushLog,
    setMonitorSamples,
    pushAlert,
    setSettings,
    settings,
    error,
    setError,
    activeId,
    setLoading,
    openWorkspace,
  } = useAppStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showHome, setShowHome] = useState(true)
  const connectLock = useRef(false)

  async function refreshProfiles() {
    setProfiles(await window.yizoo.connections.list())
  }

  async function handleExport(includeSecrets: boolean) {
    const json = await window.yizoo.connections.exportProfiles(includeSecrets)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = includeSecrets ? 'yizoo-connections.secret.json' : 'yizoo-connections.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        await window.yizoo.connections.importProfiles(text, true)
        await refreshProfiles()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    input.click()
  }

  async function handleConnect(
    profile: ConnectionProfile,
    options?: { switchFromWorkspace?: boolean },
  ) {
    const state = useAppStore.getState()
    if (options?.switchFromWorkspace && profile.id === state.activeId) return
    if (connectLock.current) return

    if (state.editorDirty) {
      const switchingConnection = state.activeId != null && state.activeId !== profile.id
      const ok = await askConfirm({
        title: t('brand'),
        message: t(switchingConnection ? 'confirmUnsavedConnection' : 'confirmUnsaved'),
        confirmLabel: t('ok'),
        cancelLabel: t('cancel'),
        danger: true,
      })
      if (!ok) return
      if (connectLock.current) return
    }

    connectLock.current = true
    setLoading(true)
    setError(null)
    try {
      // Already-connected sessions return immediately; disconnected ones establish now.
      // Workspace state is committed only after the root listing succeeds, so a failed
      // switch cannot save the previous cluster's data into the new one.
      await window.yizoo.zk.connect(profile.id)
      const [children, data, samples, alerts] = await Promise.all([
        window.yizoo.zk.listChildren(profile.id, '/'),
        window.yizoo.zk.getData(profile.id, '/'),
        window.yizoo.monitor.getLatest(profile.id),
        window.yizoo.monitor.getAlerts(profile.id),
      ])
      openWorkspace({
        id: profile.id,
        children: children.map((c) => c.name),
        node: data,
        samples,
        alerts,
      })
      setShowHome(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // Switching from workspace: keep previous connection; from home: stay on home
      if (!options?.switchFromWorkspace) setShowHome(true)
    } finally {
      connectLock.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const [profiles, logs, appSettings] = await Promise.all([
        window.yizoo.connections.list(),
        window.yizoo.logs.list(),
        window.yizoo.settings.get(),
      ])
      setProfiles(profiles)
      setLogs(logs)
      setSettings(appSettings)
      document.documentElement.style.setProperty('--font-size', `${appSettings.fontSize}px`)
      document.documentElement.dataset.theme = appSettings.theme
      void i18n.changeLanguage(appSettings.locale)
    })()

    const offs = [
      window.yizoo.on.connectionStatus(({ id, status, error: err }) => {
        setStatus(id, status)
        if (err) setError(err)
      }),
      window.yizoo.on.log((entry) => pushLog(entry)),
      window.yizoo.on.monitorSample(({ id, samples }) => {
        if (id === useAppStore.getState().activeId) setMonitorSamples(samples)
      }),
      window.yizoo.on.monitorAlert(({ id, alert }) => {
        if (id === useAppStore.getState().activeId) pushAlert(alert)
      }),
      window.yizoo.on.nodeChildrenChanged(async ({ id, path }) => {
        if (id !== useAppStore.getState().activeId) return
        try {
          const children = await window.yizoo.zk.listChildren(id, path)
          useAppStore.getState().setChildren(
            path,
            children.map((c) => c.name),
          )
        } catch {
          /* ignore */
        }
      }),
      window.yizoo.on.nodeDataChanged(async ({ id, path }) => {
        const state = useAppStore.getState()
        // Re-check dirty after await — never clobber in-progress typing
        if (id !== state.activeId || path !== state.selectedPath || state.editorDirty) return
        try {
          const data = await window.yizoo.zk.getData(id, path)
          const latest = useAppStore.getState()
          if (
            id !== latest.activeId ||
            path !== latest.selectedPath ||
            latest.editorDirty
          ) {
            return
          }
          latest.setNodeData(data)
          latest.setEditorDraft(typeof data?.data === 'string' ? data.data : '')
          latest.setEditorLang('plaintext')
        } catch {
          /* ignore */
        }
      }),
      window.yizoo.on.menuImport(() => void handleImport()),
      window.yizoo.on.menuExport(() => void handleExport(false)),
      window.yizoo.on.menuExportSecrets(() => void handleExport(true)),
    ]
    return () => offs.forEach((off) => off())
  }, [
    i18n,
    pushAlert,
    pushLog,
    setError,
    setLogs,
    setMonitorSamples,
    setProfiles,
    setSettings,
    setStatus,
  ])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`)
    document.documentElement.dataset.theme = settings.theme
  }, [settings.fontSize, settings.theme])

  const inWorkspace = Boolean(activeId) && !showHome

  return (
    <div className="app-shell">
      <IconNav
        onNew={() => {
          setEditing(null)
          setFormOpen(true)
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onShowHome={() => setShowHome(true)}
      />

      <div className="workspace">
        {inWorkspace ? (
          <>
            <TopBar
              onBackHome={() => setShowHome(true)}
              onSwitchConnection={(p) => void handleConnect(p, { switchFromWorkspace: true })}
            />
            <div className="main-pane">
              <aside className="tree-pane">
                <NodeTree />
              </aside>
              <section className="editor-pane">
                <DataEditor />
              </section>
            </div>
            <BottomDrawer />
          </>
        ) : (
          <ConnectionBoard
            onEdit={(p) => {
              setEditing(p)
              setFormOpen(true)
            }}
            onConnect={(p) => void handleConnect(p)}
          />
        )}
      </div>

      {formOpen && (
        <ConnectionFormModal initial={editing} onClose={() => setFormOpen(false)} />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <ConfirmDialog />
      {error && (
        <div className="toast" onClick={() => setError(null)} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
