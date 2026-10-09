import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AppLogEntry, LogLevel } from '../shared/types'
import { IPC } from '../shared/ipc'

const MAX_LOGS = 500
const logs: AppLogEntry[] = []

export function appendLog(level: LogLevel, source: string, message: string): AppLogEntry {
  const entry: AppLogEntry = {
    id: randomUUID(),
    ts: Date.now(),
    level,
    source,
    message,
  }
  logs.unshift(entry)
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.events.log, entry)
  }
  return entry
}

export function listLogs(): AppLogEntry[] {
  return [...logs]
}

export function clearLogs(): void {
  logs.length = 0
}
