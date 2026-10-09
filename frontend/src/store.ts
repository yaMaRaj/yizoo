import { create } from 'zustand'
import type { ConnectionProfile, ConnectionStatus, ZkChildNode, ZkNodeData } from './types'

type TreeCache = Record<string, ZkChildNode[]>

type State = {
  profiles: ConnectionProfile[]
  statuses: Record<string, ConnectionStatus>
  activeId: string | null
  selectedPath: string
  nodeData: ZkNodeData | null
  tree: TreeCache
  expanded: Record<string, boolean>
  draft: string
  dirty: boolean
  error: string | null
  loading: boolean
  showHome: boolean
  setProfiles: (p: ConnectionProfile[]) => void
  setStatus: (id: string, s: ConnectionStatus) => void
  setActiveId: (id: string | null) => void
  setSelectedPath: (p: string) => void
  setNodeData: (d: ZkNodeData | null) => void
  setChildren: (path: string, kids: ZkChildNode[]) => void
  setExpanded: (path: string, open: boolean) => void
  resetTree: () => void
  setDraft: (d: string) => void
  setDirty: (d: boolean) => void
  setError: (e: string | null) => void
  setLoading: (l: boolean) => void
  setShowHome: (v: boolean) => void
}

export const useStore = create<State>((set) => ({
  profiles: [],
  statuses: {},
  activeId: null,
  selectedPath: '/',
  nodeData: null,
  tree: {},
  expanded: { '/': true },
  draft: '',
  dirty: false,
  error: null,
  loading: false,
  showHome: true,
  setProfiles: (profiles) => set({ profiles }),
  setStatus: (id, status) => set((s) => ({ statuses: { ...s.statuses, [id]: status } })),
  setActiveId: (activeId) => set({ activeId }),
  setSelectedPath: (selectedPath) => set({ selectedPath }),
  setNodeData: (nodeData) => set({ nodeData }),
  setChildren: (path, kids) => set((s) => ({ tree: { ...s.tree, [path]: kids } })),
  setExpanded: (path, open) => set((s) => ({ expanded: { ...s.expanded, [path]: open } })),
  resetTree: () => set({ tree: {}, expanded: { '/': true }, selectedPath: '/', nodeData: null }),
  setDraft: (draft) => set({ draft }),
  setDirty: (dirty) => set({ dirty }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
  setShowHome: (showHome) => set({ showHome }),
}))
