import { create } from 'zustand'
import type {
  AppLogEntry,
  AppSettings,
  ConnectionProfile,
  ConnectionStatus,
  MonitorAlert,
  MonitorSample,
  ZkNodeData,
} from '@shared/types'

type TreeCache = Record<string, string[]>

type AppState = {
  profiles: ConnectionProfile[]
  statuses: Record<string, ConnectionStatus>
  activeId: string | null
  selectedPath: string
  nodeData: ZkNodeData | null
  tree: TreeCache
  expanded: Record<string, boolean>
  editorDraft: string
  editorDirty: boolean
  editorLang: 'plaintext' | 'json' | 'xml' | 'properties'
  bottomTab: 'terminal' | 'monitor' | 'logs' | 'fourletter'
  bottomOpen: boolean
  logs: AppLogEntry[]
  monitorSamples: MonitorSample[]
  monitorAlerts: MonitorAlert[]
  settings: AppSettings
  searchResults: string[]
  error: string | null
  loading: boolean
  setProfiles: (profiles: ConnectionProfile[]) => void
  setStatus: (id: string, status: ConnectionStatus) => void
  setActiveId: (id: string | null) => void
  setSelectedPath: (path: string) => void
  setNodeData: (data: ZkNodeData | null) => void
  setChildren: (path: string, children: string[]) => void
  setExpanded: (path: string, open: boolean) => void
  resetWorkspaceTree: () => void
  setEditorDraft: (draft: string) => void
  setEditorDirty: (dirty: boolean) => void
  setEditorLang: (lang: AppState['editorLang']) => void
  setBottomTab: (tab: AppState['bottomTab']) => void
  setBottomOpen: (open: boolean) => void
  pushLog: (entry: AppLogEntry) => void
  setLogs: (logs: AppLogEntry[]) => void
  setMonitorSamples: (samples: MonitorSample[]) => void
  pushAlert: (alert: MonitorAlert) => void
  setAlerts: (alerts: MonitorAlert[]) => void
  setSettings: (settings: AppSettings) => void
  setSearchResults: (paths: string[]) => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  profiles: [],
  statuses: {},
  activeId: null,
  selectedPath: '/',
  nodeData: null,
  tree: {},
  expanded: { '/': true },
  editorDraft: '',
  editorDirty: false,
  editorLang: 'plaintext',
  bottomTab: 'terminal',
  bottomOpen: true,
  logs: [],
  monitorSamples: [],
  monitorAlerts: [],
  settings: { locale: 'zh', fontSize: 14, monitorIntervalMs: 5000, theme: 'light' },
  searchResults: [],
  error: null,
  loading: false,
  setProfiles: (profiles) => set({ profiles }),
  setStatus: (id, status) => set((s) => ({ statuses: { ...s.statuses, [id]: status } })),
  setActiveId: (activeId) => set({ activeId }),
  setSelectedPath: (selectedPath) => set({ selectedPath }),
  setNodeData: (nodeData) => set({ nodeData }),
  setChildren: (path, children) => set((s) => ({ tree: { ...s.tree, [path]: children } })),
  setExpanded: (path, open) => set((s) => ({ expanded: { ...s.expanded, [path]: open } })),
  resetWorkspaceTree: () => set({ tree: {}, expanded: { '/': true }, selectedPath: '/', searchResults: [] }),
  setEditorDraft: (editorDraft) => set({ editorDraft }),
  setEditorDirty: (editorDirty) => set({ editorDirty }),
  setEditorLang: (editorLang) => set({ editorLang }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setBottomOpen: (bottomOpen) => set({ bottomOpen }),
  pushLog: (entry) => set((s) => ({ logs: [entry, ...s.logs].slice(0, 500) })),
  setLogs: (logs) => set({ logs }),
  setMonitorSamples: (monitorSamples) => set({ monitorSamples }),
  pushAlert: (alert) =>
    set((s) => ({ monitorAlerts: [alert, ...s.monitorAlerts].slice(0, 100) })),
  setAlerts: (monitorAlerts) => set({ monitorAlerts }),
  setSettings: (settings) => set({ settings }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
}))
