export type ConnectionAuth = {
  scheme?: string
  auth?: string
}

export type SshConfig = {
  enabled: boolean
  host: string
  port: number
  username: string
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

export type ZkNodeData = {
  path: string
  data: string
  stat: ZkStat
  acls: { scheme: string; id: string; perms: number }[]
}

export type ZkChildNode = {
  name: string
  path: string
}
