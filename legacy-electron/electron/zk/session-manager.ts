import zookeeper from 'node-zookeeper-client'
import type { Client, Stat, ACL } from 'node-zookeeper-client'
import { BrowserWindow } from 'electron'
import type {
  ConnectionProfile,
  ConnectionStatus,
  ZkAcl,
  ZkChildNode,
  ZkNodeData,
  ZkStat,
} from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { getConnection } from '../store/config'
import { openSshTunnel, type TunnelHandle } from '../ssh/tunnel'
import { appendLog } from '../logger'
import { sendFourLetter } from './four-letter'

const CreateMode = zookeeper.CreateMode
const State = zookeeper.State
const Exception = zookeeper.Exception
const OPEN_ACL = zookeeper.ACL.OPEN_ACL_UNSAFE

type Session = {
  id: string
  profile: ConnectionProfile
  client: Client
  status: ConnectionStatus
  tunnel?: TunnelHandle
  connectHost: string
  connectPort: number
  watchedPaths: Set<string>
}

const sessions = new Map<string, Session>()

function emitStatus(id: string, status: ConnectionStatus, error?: string): void {
  const session = sessions.get(id)
  if (session) session.status = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.events.connectionStatus, { id, status, error })
  }
}

function longToNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  // node-zookeeper-client represents jute `long` as an 8-byte big-endian Buffer
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
    if (buf.length < 8) return 0
    try {
      return Number(buf.readBigInt64BE(0))
    } catch {
      const high = buf.readInt32BE(0)
      const low = buf.readUInt32BE(4)
      return high * 0x1_0000_0000 + low
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as { toNumber?: () => number; low?: number; high?: number }
    if (typeof obj.toNumber === 'function') return obj.toNumber()
    if (typeof obj.low === 'number') {
      const low = obj.low >>> 0
      const high = typeof obj.high === 'number' ? obj.high : 0
      return high * 0x1_0000_0000 + low
    }
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function longToHex(value: unknown): string {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
    if (buf.length >= 8) return '0x' + buf.subarray(0, 8).toString('hex')
  }
  if (typeof value === 'bigint') return '0x' + value.toString(16)
  const n = longToNumber(value)
  if (!Number.isFinite(n)) return '0x0'
  const big = BigInt(Math.trunc(n))
  return '0x' + (big < 0n ? big.toString(16) : big.toString(16))
}

function normalizeStat(stat: Stat): ZkStat {
  // Access fields from the raw jute Stat (longs are Buffers)
  const raw = stat as Stat & Record<string, unknown>
  return {
    czxid: longToHex(raw.czxid),
    mzxid: longToHex(raw.mzxid),
    ctime: longToNumber(raw.ctime),
    mtime: longToNumber(raw.mtime),
    version: longToNumber(raw.version),
    cversion: longToNumber(raw.cversion),
    aversion: longToNumber(raw.aversion),
    ephemeralOwner: longToHex(raw.ephemeralOwner),
    dataLength: longToNumber(raw.dataLength),
    numChildren: longToNumber(raw.numChildren),
    pzxid: longToHex(raw.pzxid),
  }
}

/** Ensure IPC payload is plain JSON-safe (no Long/Buffer leftovers). */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function bufferToText(buf: Buffer): string {
  if (!buf || buf.length === 0) return ''
  const nulRatio = buf.filter((b) => b === 0).length / buf.length
  if (nulRatio > 0.3) return buf.toString('hex')
  return buf.toString('utf8')
}

function aclToZk(acls: ACL[]): ZkAcl[] {
  return acls.map((a) => ({
    scheme: a.id.scheme,
    id: a.id.id,
    perms: a.perms,
  }))
}

function zkToAcl(acls: ZkAcl[]): ACL[] {
  return acls.map((a) => ({
    id: { scheme: a.scheme, id: a.id },
    perms: a.perms,
  }))
}

function ensureSession(id: string): Session {
  const s = sessions.get(id)
  if (!s) throw new Error('Not connected')
  if (s.status !== 'connected' && s.status !== 'reconnecting') {
    throw new Error(`Connection is ${s.status}`)
  }
  return s
}

function getChildrenAsync(client: Client, path: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    client.getChildren(path, (err: Error | null, children: string[]) => {
      if (err) reject(err)
      else resolve(children ?? [])
    })
  })
}

function getDataAsync(client: Client, path: string): Promise<{ data: Buffer; stat: Stat }> {
  return new Promise((resolve, reject) => {
    client.getData(path, (err: Error | null, data: Buffer, stat: Stat) => {
      if (err) reject(err)
      else if (!stat) reject(new Error(`No stat returned for ${path}`))
      else resolve({ data: coerceToBuffer(data), stat })
    })
  })
}

function coerceToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data == null) return Buffer.alloc(0)
  if (typeof data === 'string') return Buffer.from(data, 'utf8')
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (Array.isArray(data)) return Buffer.from(data)
  return Buffer.alloc(0)
}

function getAclAsync(client: Client, path: string): Promise<{ acls: ACL[]; stat: Stat }> {
  return new Promise((resolve, reject) => {
    client.getACL(path, (err: Error | null, acls: ACL[], stat: Stat) => {
      if (err) reject(err)
      else resolve({ acls: acls ?? [], stat })
    })
  })
}

export function getStatus(id: string): ConnectionStatus {
  return sessions.get(id)?.status ?? 'disconnected'
}

export function getSessionEndpoint(id: string): { host: string; port: number } | undefined {
  const s = sessions.get(id)
  if (!s) return undefined
  return { host: s.connectHost, port: s.connectPort }
}

export function getProfileHosts(id: string): Array<{ host: string; port: number }> {
  const profile = getConnection(id) ?? sessions.get(id)?.profile
  if (!profile) return []
  const hosts = profile.host
    .split(',')
    .map((h: string) => h.trim())
    .filter(Boolean)
  return hosts.map((h: string) => {
    const [host, p] = h.split(':')
    return { host, port: p ? Number(p) : profile.port }
  })
}

export async function connect(id: string): Promise<void> {
  const existing = sessions.get(id)
  if (existing && (existing.status === 'connected' || existing.status === 'connecting')) {
    return
  }
  if (existing) {
    await disconnect(id)
  }

  const profile = getConnection(id)
  if (!profile) throw new Error('Connection profile not found')

  emitStatus(id, 'connecting')
  appendLog('info', 'zk', `Connecting ${profile.name} (${profile.host}:${profile.port})`)

  let tunnel: TunnelHandle | undefined
  let connectHost = profile.host.split(',')[0].split(':')[0]
  let connectPort = profile.port

  try {
    if (profile.ssh?.enabled) {
      tunnel = await openSshTunnel(profile.ssh, connectHost, connectPort)
      connectHost = '127.0.0.1'
      connectPort = tunnel.localPort
    }

    const connectionString = `${connectHost}:${connectPort}`
    const client = zookeeper.createClient(connectionString, {
      sessionTimeout: profile.sessionTimeoutMs || 30000,
      retries: 3,
    })

    const session: Session = {
      id,
      profile,
      client,
      status: 'connecting',
      tunnel,
      connectHost,
      connectPort,
      watchedPaths: new Set(),
    }
    sessions.set(id, session)

    if (profile.auth?.scheme && profile.auth?.auth) {
      client.addAuthInfo(profile.auth.scheme, Buffer.from(profile.auth.auth))
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, profile.connectionTimeoutMs || 15000)

      client.once('connected', () => {
        clearTimeout(timer)
        resolve()
      })
      client.on('state', (state: unknown) => {
        if (state === State.SYNC_CONNECTED) {
          emitStatus(id, 'connected')
        } else if (state === State.DISCONNECTED || state === State.EXPIRED) {
          emitStatus(id, 'reconnecting')
          appendLog('warn', 'zk', `${profile.name} session changed`)
        } else if (state === State.AUTH_FAILED) {
          emitStatus(id, 'error', 'Auth failed')
        }
      })
      client.on('connected', () => {
        emitStatus(id, 'connected')
      })
      client.on('disconnected', () => {
        emitStatus(id, 'reconnecting')
      })
      client.connect()
    })

    emitStatus(id, 'connected')
    appendLog('info', 'zk', `Connected ${profile.name}`)
  } catch (err) {
    if (tunnel) await tunnel.close().catch(() => undefined)
    sessions.delete(id)
    const message = err instanceof Error ? err.message : String(err)
    emitStatus(id, 'error', message)
    appendLog('error', 'zk', `Connect failed: ${message}`)
    throw err
  }
}

export async function disconnect(id: string): Promise<void> {
  const session = sessions.get(id)
  if (!session) {
    emitStatus(id, 'disconnected')
    return
  }
  try {
    session.client.close()
  } catch {
    /* ignore */
  }
  if (session.tunnel) {
    await session.tunnel.close().catch(() => undefined)
  }
  sessions.delete(id)
  emitStatus(id, 'disconnected')
  appendLog('info', 'zk', `Disconnected ${session.profile.name}`)
}

function watchChildren(session: Session, path: string): void {
  if (session.watchedPaths.has(`c:${path}`)) return
  session.watchedPaths.add(`c:${path}`)
  const watcher = () => {
    session.watchedPaths.delete(`c:${path}`)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.events.nodeChildrenChanged, { id: session.id, path })
    }
    if (sessions.has(session.id)) watchChildren(session, path)
  }
  session.client.getChildren(path, watcher, () => undefined)
}

function watchData(session: Session, path: string): void {
  if (session.watchedPaths.has(`d:${path}`)) return
  session.watchedPaths.add(`d:${path}`)
  const watcher = () => {
    session.watchedPaths.delete(`d:${path}`)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.events.nodeDataChanged, { id: session.id, path })
    }
    if (sessions.has(session.id)) watchData(session, path)
  }
  session.client.getData(path, watcher, () => undefined)
}

export async function listChildren(id: string, path: string): Promise<ZkChildNode[]> {
  const session = ensureSession(id)
  const normalized = path || '/'
  const children = await getChildrenAsync(session.client, normalized)
  watchChildren(session, normalized)
  return children.sort().map((name) => ({
    name,
    path: normalized === '/' ? `/${name}` : `${normalized}/${name}`,
  }))
}

export async function getData(id: string, path: string): Promise<ZkNodeData> {
  const session = ensureSession(id)
  const { data, stat } = await getDataAsync(session.client, path)
  let acls: ZkAcl[] = []
  try {
    const aclsResult = await getAclAsync(session.client, path)
    acls = aclToZk(aclsResult.acls)
  } catch (err) {
    appendLog('warn', 'zk', `getAcl failed for ${path}: ${err instanceof Error ? err.message : String(err)}`)
  }
  watchData(session, path)
  // Plain clone avoids IPC failures from Long/Buffer-like values
  return toPlain({
    path,
    data: bufferToText(data),
    stat: normalizeStat(stat),
    acls,
  })
}

export async function setData(
  id: string,
  path: string,
  data: string,
  version = -1,
): Promise<ZkStat> {
  const session = ensureSession(id)
  const stat = await new Promise<Stat>((resolve, reject) => {
    session.client.setData(path, Buffer.from(data, 'utf8'), version, (err, st) => {
      if (err) reject(err)
      else resolve(st)
    })
  })
  appendLog('info', 'zk', `set ${path}`)
  return toPlain(normalizeStat(stat))
}

export async function createNode(
  id: string,
  path: string,
  data: string,
  ephemeral = false,
  sequential = false,
): Promise<string> {
  const session = ensureSession(id)
  let mode = CreateMode.PERSISTENT
  if (ephemeral && sequential) mode = CreateMode.EPHEMERAL_SEQUENTIAL
  else if (ephemeral) mode = CreateMode.EPHEMERAL
  else if (sequential) mode = CreateMode.PERSISTENT_SEQUENTIAL

  const created = await new Promise<string>((resolve, reject) => {
    session.client.mkdirp(
      path,
      Buffer.from(data ?? '', 'utf8'),
      OPEN_ACL,
      mode,
      (err, p) => {
        if (err) {
          session.client.create(
            path,
            Buffer.from(data ?? '', 'utf8'),
            OPEN_ACL,
            mode,
            (err2, p2) => {
              if (err2) reject(err2)
              else resolve(p2)
            },
          )
        } else resolve(p)
      },
    )
  })
  appendLog('info', 'zk', `create ${created}`)
  return created
}

export async function removeNode(id: string, path: string, recursive = false): Promise<void> {
  const session = ensureSession(id)
  if (!recursive) {
    await new Promise<void>((resolve, reject) => {
      session.client.remove(path, -1, (err) => (err ? reject(err) : resolve()))
    })
    appendLog('info', 'zk', `delete ${path}`)
    return
  }
  await removeRecursive(session.client, path)
  appendLog('info', 'zk', `rmr ${path}`)
}

async function removeRecursive(client: Client, path: string): Promise<void> {
  const children = await getChildrenAsync(client, path)
  for (const child of children) {
    const childPath = path === '/' ? `/${child}` : `${path}/${child}`
    await removeRecursive(client, childPath)
  }
  await new Promise<void>((resolve, reject) => {
    client.remove(path, -1, (err) => {
      if (err && (err as { code?: number }).code === Exception.NO_NODE) resolve()
      else if (err) reject(err)
      else resolve()
    })
  })
}

export function getAcl(
  id: string,
  path: string,
): Promise<{ acls: ZkAcl[]; stat: ZkStat }> {
  const session = ensureSession(id)
  return getAclAsync(session.client, path).then((result) =>
    toPlain({ acls: aclToZk(result.acls), stat: normalizeStat(result.stat) }),
  )
}

export async function setAcl(
  id: string,
  path: string,
  acls: ZkAcl[],
  version = -1,
): Promise<ZkStat> {
  const session = ensureSession(id)
  const stat = await new Promise<Stat>((resolve, reject) => {
    session.client.setACL(path, zkToAcl(acls), version, (err, st) => {
      if (err) reject(err)
      else resolve(st)
    })
  })
  appendLog('info', 'zk', `setAcl ${path}`)
  return toPlain(normalizeStat(stat))
}

export async function search(
  id: string,
  root: string,
  keyword: string,
  limit = 100,
): Promise<string[]> {
  const session = ensureSession(id)
  const found: string[] = []
  const kw = keyword.toLowerCase().trim()
  if (!kw) return []

  // BFS — avoids deep recursion stack and feels more responsive
  const queue: string[] = [root || '/']
  const seen = new Set<string>()
  let visited = 0
  const maxVisit = 5000

  while (queue.length > 0 && found.length < limit && visited < maxVisit) {
    const path = queue.shift()!
    if (seen.has(path)) continue
    seen.add(path)
    visited++

    const name = path === '/' ? '' : (path.split('/').pop() ?? '')
    if (name.toLowerCase().includes(kw) || path.toLowerCase().includes(kw)) {
      if (path !== '/' || kw === '/') found.push(path)
    }

    let children: string[] = []
    try {
      children = await getChildrenAsync(session.client, path)
    } catch {
      continue
    }
    for (const child of children) {
      const childPath = path === '/' ? `/${child}` : `${path}/${child}`
      if (!seen.has(childPath)) queue.push(childPath)
    }
  }

  return found
}

export async function completePath(id: string, partial: string): Promise<string[]> {
  const session = ensureSession(id)
  const raw = partial || '/'
  const lastSlash = raw.lastIndexOf('/')
  const parent = lastSlash <= 0 ? '/' : raw.slice(0, lastSlash)
  const prefix = raw.slice(lastSlash + 1)
  try {
    const children = await getChildrenAsync(session.client, parent)
    return children
      .filter((c) => c.startsWith(prefix))
      .sort()
      .slice(0, 50)
      .map((c) => (parent === '/' ? `/${c}` : `${parent}/${c}`))
  } catch {
    return []
  }
}

export async function fourLetter(
  id: string,
  command: string,
  host?: string,
  port?: number,
): Promise<string> {
  const session = sessions.get(id)
  const endpoint =
    host && port
      ? { host, port }
      : session
        ? { host: session.connectHost, port: session.connectPort }
        : getProfileHosts(id)[0]
  if (!endpoint) throw new Error('No endpoint for 4lw')
  return sendFourLetter(endpoint.host, endpoint.port, command)
}
