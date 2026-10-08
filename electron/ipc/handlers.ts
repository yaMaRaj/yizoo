import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import * as config from '../store/config'
import * as zk from '../zk/session-manager'
import { executeCli } from '../zk/cli-executor'
import * as monitor from '../zk/monitor'
import * as logger from '../logger'
import type { ConnectionProfile, ZkAcl, AppSettings } from '../../shared/types'

export function registerIpc(): void {
  ipcMain.handle(IPC.connections.list, () => config.listConnections())
  ipcMain.handle(IPC.connections.save, (_e, profile: ConnectionProfile) => config.saveConnection(profile))
  ipcMain.handle(IPC.connections.remove, async (_e, id: string) => {
    monitor.stopMonitor(id)
    await zk.disconnect(id)
    config.removeConnection(id)
  })
  ipcMain.handle(IPC.connections.export, (_e, includeSecrets: boolean) =>
    config.exportProfiles(includeSecrets),
  )
  ipcMain.handle(IPC.connections.import, (_e, json: string, merge: boolean) =>
    config.importProfiles(json, merge),
  )

  ipcMain.handle(IPC.zk.connect, async (_e, id: string) => {
    await zk.connect(id)
    monitor.startMonitor(id)
  })
  ipcMain.handle(IPC.zk.disconnect, async (_e, id: string) => {
    monitor.stopMonitor(id)
    await zk.disconnect(id)
  })
  ipcMain.handle(IPC.zk.getStatus, (_e, id: string) => zk.getStatus(id))
  ipcMain.handle(IPC.zk.listChildren, (_e, id: string, path: string) => zk.listChildren(id, path))
  ipcMain.handle(IPC.zk.getData, (_e, id: string, path: string) => zk.getData(id, path))
  ipcMain.handle(IPC.zk.setData, (_e, id: string, path: string, data: string, version?: number) =>
    zk.setData(id, path, data, version),
  )
  ipcMain.handle(
    IPC.zk.create,
    (_e, id: string, path: string, data: string, ephemeral?: boolean, sequential?: boolean) =>
      zk.createNode(id, path, data, ephemeral, sequential),
  )
  ipcMain.handle(IPC.zk.remove, (_e, id: string, path: string, recursive?: boolean) =>
    zk.removeNode(id, path, recursive),
  )
  ipcMain.handle(IPC.zk.getAcl, (_e, id: string, path: string) => zk.getAcl(id, path))
  ipcMain.handle(
    IPC.zk.setAcl,
    (_e, id: string, path: string, acls: ZkAcl[], version?: number) =>
      zk.setAcl(id, path, acls, version),
  )
  ipcMain.handle(
    IPC.zk.search,
    (_e, id: string, root: string, keyword: string, limit?: number) =>
      zk.search(id, root, keyword, limit),
  )
  ipcMain.handle(IPC.zk.executeCli, (_e, id: string, line: string) => executeCli(id, line))
  ipcMain.handle(IPC.zk.completePath, (_e, id: string, partial: string) =>
    zk.completePath(id, partial),
  )
  ipcMain.handle(
    IPC.zk.fourLetter,
    (_e, id: string, command: string, host?: string, port?: number) =>
      zk.fourLetter(id, command, host, port),
  )

  ipcMain.handle(IPC.monitor.start, (_e, id: string) => monitor.startMonitor(id))
  ipcMain.handle(IPC.monitor.stop, (_e, id: string) => monitor.stopMonitor(id))
  ipcMain.handle(IPC.monitor.getLatest, (_e, id: string) => monitor.getLatest(id))
  ipcMain.handle(IPC.monitor.getHistory, (_e, id: string, host: string) =>
    monitor.getHistory(id, host),
  )
  ipcMain.handle(IPC.monitor.getAlerts, (_e, id: string) => monitor.getAlerts(id))

  ipcMain.handle(IPC.settings.get, () => config.getSettings())
  ipcMain.handle(IPC.settings.set, (_e, patch: Partial<AppSettings>) => {
    const prev = config.getSettings()
    const next = config.setSettings(patch)
    if (
      patch.monitorIntervalMs != null &&
      patch.monitorIntervalMs !== prev.monitorIntervalMs
    ) {
      monitor.restartAllMonitors()
    }
    return next
  })

  ipcMain.handle(IPC.logs.list, () => logger.listLogs())
  ipcMain.handle(IPC.logs.clear, () => logger.clearLogs())
}
