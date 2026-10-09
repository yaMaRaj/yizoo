export type ConnectionAuth = {
  scheme?: string
  auth?: string
}

export type SshConfig = {
  enabled: boolean
  host: string
  port: number
  username: string
  /** Plain password kept only in memory / encrypted store; never exported by default */
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export type ConnectionProfile = {
  id: string
  name: string
  host: string
  port: number
  connectionTimeoutMs: number
  sessionTimeoutMs: number
  auth?: ConnectionAuth
  ssh?: SshConfig
  createdAt: number
  updatedAt: number
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type ZkStat = {
  czxid: string
  mzxid: string
  ctime: number
  mtime: number
  version: number
  cversion: number
  aversion: number
  ephemeralOwner: string
  dataLength: number
  numChildren: number
  pzxid: string
}

export type ZkAcl = {
  scheme: string
  id: string
  perms: number
}

export type ZkNodeData = {
  path: string
  data: string
  stat: ZkStat
  acls: ZkAcl[]
}

export type ZkChildNode = {
  name: string
  path: string
  numChildren?: number
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type AppLogEntry = {
  id: string
  ts: number
  level: LogLevel
  source: string
  message: string
}

export type MonitorSample = {
  ts: number
  host: string
  port: number
  ruok: boolean
  mode?: string
  latencyAvg?: number
  latencyMax?: number
  packetsReceived?: number
  packetsSent?: number
  numAliveConnections?: number
  outstandingRequests?: number
  znodeCount?: number
  watchCount?: number
  zxid?: string
  raw?: Record<string, string>
  error?: string
}

export type MonitorAlert = {
  id: string
  ts: number
  severity: 'info' | 'warn' | 'critical'
  host: string
  message: string
}

export type AppSettings = {
  locale: 'zh' | 'en'
  fontSize: number
  monitorIntervalMs: number
  theme: 'light' | 'dark'
}

export type CliResult = {
  ok: boolean
  output: string
}

export const PERM = {
  READ: 1,
  WRITE: 2,
  CREATE: 4,
  DELETE: 8,
  ADMIN: 16,
  ALL: 31,
} as const

export type IpcApi = {
  connections: {
    list: () => Promise<ConnectionProfile[]>
    save: (profile: ConnectionProfile) => Promise<ConnectionProfile>
    remove: (id: string) => Promise<void>
    exportProfiles: (includeSecrets: boolean) => Promise<string>
    importProfiles: (json: string, merge: boolean) => Promise<ConnectionProfile[]>
  }
  zk: {
    connect: (id: string) => Promise<void>
    disconnect: (id: string) => Promise<void>
    getStatus: (id: string) => Promise<ConnectionStatus>
    listChildren: (id: string, path: string) => Promise<ZkChildNode[]>
    getData: (id: string, path: string) => Promise<ZkNodeData>
    setData: (id: string, path: string, data: string, version?: number) => Promise<ZkStat>
    create: (
      id: string,
      path: string,
      data: string,
      ephemeral?: boolean,
      sequential?: boolean,
    ) => Promise<string>
    remove: (id: string, path: string, recursive?: boolean) => Promise<void>
    getAcl: (id: string, path: string) => Promise<{ acls: ZkAcl[]; stat: ZkStat }>
    setAcl: (id: string, path: string, acls: ZkAcl[], version?: number) => Promise<ZkStat>
    search: (id: string, root: string, keyword: string, limit?: number) => Promise<string[]>
    executeCli: (id: string, line: string) => Promise<CliResult>
    completePath: (id: string, partial: string) => Promise<string[]>
    fourLetter: (id: string, command: string, host?: string, port?: number) => Promise<string>
  }
  monitor: {
    start: (id: string) => Promise<void>
    stop: (id: string) => Promise<void>
    getLatest: (id: string) => Promise<MonitorSample[]>
    getHistory: (id: string, host: string) => Promise<MonitorSample[]>
    getAlerts: (id: string) => Promise<MonitorAlert[]>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  logs: {
    list: () => Promise<AppLogEntry[]>
    clear: () => Promise<void>
  }
  on: {
    connectionStatus: (cb: (payload: { id: string; status: ConnectionStatus; error?: string }) => void) => () => void
    nodeChildrenChanged: (cb: (payload: { id: string; path: string }) => void) => () => void
    nodeDataChanged: (cb: (payload: { id: string; path: string }) => void) => () => void
    log: (cb: (entry: AppLogEntry) => void) => () => void
    monitorSample: (cb: (payload: { id: string; samples: MonitorSample[] }) => void) => () => void
    monitorAlert: (cb: (payload: { id: string; alert: MonitorAlert }) => void) => () => void
    menuImport: (cb: () => void) => () => void
    menuExport: (cb: () => void) => () => void
    menuExportSecrets: (cb: () => void) => () => void
  }
}
