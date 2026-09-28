import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { IpcApi, ConnectionProfile, ZkAcl, AppSettings } from '../shared/types'

function subscribe<T = void>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: IpcApi = {
  connections: {
    list: () => ipcRenderer.invoke(IPC.connections.list),
    save: (profile: ConnectionProfile) => ipcRenderer.invoke(IPC.connections.save, profile),
    remove: (id: string) => ipcRenderer.invoke(IPC.connections.remove, id),
    exportProfiles: (includeSecrets: boolean) =>
      ipcRenderer.invoke(IPC.connections.export, includeSecrets),
    importProfiles: (json: string, merge: boolean) =>
      ipcRenderer.invoke(IPC.connections.import, json, merge),
  },
  zk: {
    connect: (id) => ipcRenderer.invoke(IPC.zk.connect, id),
    disconnect: (id) => ipcRenderer.invoke(IPC.zk.disconnect, id),
    getStatus: (id) => ipcRenderer.invoke(IPC.zk.getStatus, id),
    listChildren: (id, path) => ipcRenderer.invoke(IPC.zk.listChildren, id, path),
    getData: (id, path) => ipcRenderer.invoke(IPC.zk.getData, id, path),
    setData: (id, path, data, version) =>
      ipcRenderer.invoke(IPC.zk.setData, id, path, data, version),
    create: (id, path, data, ephemeral, sequential) =>
      ipcRenderer.invoke(IPC.zk.create, id, path, data, ephemeral, sequential),
    remove: (id, path, recursive) => ipcRenderer.invoke(IPC.zk.remove, id, path, recursive),
    getAcl: (id, path) => ipcRenderer.invoke(IPC.zk.getAcl, id, path),
    setAcl: (id, path, acls: ZkAcl[], version) =>
      ipcRenderer.invoke(IPC.zk.setAcl, id, path, acls, version),
    search: (id, root, keyword, limit) =>
      ipcRenderer.invoke(IPC.zk.search, id, root, keyword, limit),
    executeCli: (id, line) => ipcRenderer.invoke(IPC.zk.executeCli, id, line),
    completePath: (id, partial) => ipcRenderer.invoke(IPC.zk.completePath, id, partial),
    fourLetter: (id, command, host, port) =>
      ipcRenderer.invoke(IPC.zk.fourLetter, id, command, host, port),
  },
  monitor: {
    start: (id) => ipcRenderer.invoke(IPC.monitor.start, id),
    stop: (id) => ipcRenderer.invoke(IPC.monitor.stop, id),
    getLatest: (id) => ipcRenderer.invoke(IPC.monitor.getLatest, id),
    getHistory: (id, host) => ipcRenderer.invoke(IPC.monitor.getHistory, id, host),
    getAlerts: (id) => ipcRenderer.invoke(IPC.monitor.getAlerts, id),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settings.set, patch),
  },
  logs: {
    list: () => ipcRenderer.invoke(IPC.logs.list),
    clear: () => ipcRenderer.invoke(IPC.logs.clear),
  },
  on: {
    connectionStatus: (cb) => subscribe(IPC.events.connectionStatus, cb),
    nodeChildrenChanged: (cb) => subscribe(IPC.events.nodeChildrenChanged, cb),
    nodeDataChanged: (cb) => subscribe(IPC.events.nodeDataChanged, cb),
    log: (cb) => subscribe(IPC.events.log, cb),
    monitorSample: (cb) => subscribe(IPC.events.monitorSample, cb),
    monitorAlert: (cb) => subscribe(IPC.events.monitorAlert, cb),
    menuImport: (cb) => subscribe(IPC.events.menuImport, cb),
    menuExport: (cb) => subscribe(IPC.events.menuExport, cb),
    menuExportSecrets: (cb) => subscribe(IPC.events.menuExportSecrets, cb),
  },
}

contextBridge.exposeInMainWorld('yizoo', api)
