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
import { formatEnsemble, parseEnsemble, type HostPort } from '../../shared/hosts'
import { pathMatchesKeyword } from '../../shared/search'
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
  client?: Client
  status: ConnectionStatus
  tunnel?: TunnelHandle
  connectHost: string
  connectPort: number
  watchedPaths: Set<string>
  /** Rejects an in-flight connect when the user disconnects first. */
  cancelConnect?: (err: Error) => void
}

const sessions = new Map<string, Session>()
const pendingConnects = new Map<string, Promise<void>>()

function emitStatus(id: string, status: ConnectionStatus, error?: string): void {
  const session = sessions.get(id)
  if (session) session.status = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.events.connectionStatus, { id, status, error })
  }
}

function isLive(session: Session): boolean {
  return sessions.get(session.id) === session
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
  return '0x' + big.toString(16)
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

function ensureSession(id: string): Session & { client: Client } {
  const s = sessions.get(id)
  if (!s || !s.client) throw new Error('Not connected')
  if (s.status !== 'connected' && s.status !== 'reconnecting') {
    throw new Error(`Connection is ${s.status}`)
  }
  return s as Session & { client: Client }
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

function closeClient(client: Client | undefined): void {
  if (!client) return
  try {
    client.removeAllListeners()
  } catch {
    /* ignore */
  }
  try {
    client.close()
  } catch {
    /* ignore */
  }
}

export function getStatus(id: string): ConnectionStatus {
  return sessions.get(id)?.status ?? 'disconnected'
}

export function getSessionEndpoint(id: string): { host: string; port: number } | undefined {
  const s = sessions.get(id)
  if (!s) return undefined
  return { host: s.connectHost, port: s.connectPort }
}

export function getProfileHosts(id: string): HostPort[] {
  const profile = getConnection(id) ?? sessions.get(id)?.profile
  if (!profile) return []
  return parseEnsemble(profile.host, profile.port)
}

/** Hosts the monitor should probe. SSH sessions stay on the local tunnel. */
export function getMonitorTargets(id: string): HostPort[] {
  const session = sessions.get(id)
  if (session?.tunnel) {
    return [{ host: session.connectHost, port: session.connectPort }]
  }
  const hosts = getProfileHosts(id)
  if (hosts.length > 0) return hosts
  if (session) return [{ host: session.connectHost, port: session.connectPort }]
  return []
}

export function connect(id: string): Promise<void> {
  const current = sessions.get(id)
  if (current && (current.status === 'connected' || current.status === 'reconnecting')) {
    return Promise.resolve()
  }
  const inflight = pendingConnects.get(id)
  if (inflight) return inflight

  const job = connectInner(id).finally(() => {
    if (pendingConnects.get(id) === job) pendingConnects.delete(id)
  })
  pendingConnects.set(id, job)
  return job
}

async function connectInner(id: string): Promise<void> {
  const existing = sessions.get(id)
  if (existing) await disconnect(id)

  const profile = getConnection(id)
  if (!profile) throw new Error('Connection profile not found')

  const ensemble = parseEnsemble(profile.host, profile.port)
  if (ensemble.length === 0) throw new Error('No ZooKeeper host configured')

  const session: Session = {
    id,
    profile,
    status: 'connecting',
    connectHost: ensemble[0].host,
    connectPort: ensemble[0].port,
    watchedPaths: new Set(),
  }
  sessions.set(id, session)
  emitStatus(id, 'connecting')
  appendLog(
    'info',
    'zk',
    `Connecting ${profile.name} (${formatEnsemble(ensemble)})`,
  )

  let established = false

  try {
    if (profile.ssh?.enabled) {
      const first = ensemble[0]
      const tunnel = await openSshTunnel(profile.ssh, first.host, first.port)
      if (!isLive(session)) {
        await tunnel.close().catch(() => undefined)
        throw new Error('Disconnected')
      }
      session.tunnel = tunnel
      session.connectHost = '127.0.0.1'
      session.connectPort = tunnel.localPort
      tunnel.onUnexpectedClose(() => {
        if (!isLive(session)) return
        appendLog('error', 'ssh', `SSH tunnel dropped for ${profile.name}`)
        void disconnect(id, 'SSH tunnel closed')
      })
    }

    const connectionString = session.tunnel
      ? `${session.connectHost}:${session.connectPort}`
      : formatEnsemble(ensemble)
    const client = zookeeper.createClient(connectionString, {
      sessionTimeout: profile.sessionTimeoutMs || 30000,
      retries: 3,
    })
    session.client = client

    if (profile.auth?.scheme && profile.auth?.auth) {
      client.addAuthInfo(profile.auth.scheme, Buffer.from(profile.auth.auth))
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        fail(new Error('Connection timeout'))
      }, profile.connectionTimeoutMs || 15000)

      function fail(err: Error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        session.cancelConnect = undefined
        reject(err)
      }

      function succeed() {
        if (settled) return
        settled = true
        established = true
        clearTimeout(timer)
        session.cancelConnect = undefined
        resolve()
      }

      session.cancelConnect = fail
      client.on('connected', succeed)
      client.on('connectedReadOnly', () => {
        appendLog('warn', 'zk', `${profile.name} connected read-only`)
        succeed()
      })
      client.on('authenticationFailed', () => fail(new Error('Auth failed')))
      client.on('state', (state: unknown) => {
        if (!isLive(session)) return
        if (state === State.AUTH_FAILED) {
          fail(new Error('Auth failed'))
          return
        }
        if (state === State.SYNC_CONNECTED || state === State.CONNECTED_READ_ONLY) {
          succeed()
          emitStatus(id, 'connected')
          return
        }
        if (!established) return
        if (state === State.DISCONNECTED) {
          emitStatus(id, 'reconnecting')
          appendLog('warn', 'zk', `${profile.name} disconnected`)
        } else if (state === State.EXPIRED) {
          emitStatus(id, 'error', 'Session expired')
          appendLog('warn', 'zk', `${profile.name} session expired`)
        }
      })
      client.connect()
    })

    if (!isLive(session)) throw new Error('Disconnected')
    emitStatus(id, 'connected')
    appendLog('info', 'zk', `Connected ${profile.name}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const owned = isLive(session)
    if (owned) {
      closeClient(session.client)
      if (session.tunnel) await session.tunnel.close().catch(() => undefined)
      sessions.delete(id)
      emitStatus(id, 'error', message)
      appendLog('error', 'zk', `Connect failed: ${message}`)
    }
    throw err
  }
}

export async function disconnect(id: string, error?: string): Promise<void> {
  const session = sessions.get(id)
  if (!session) {
    emitStatus(id, 'disconnected')
    return
  }
  // Detach before any await so a failing connect does not emit a second status.
  sessions.delete(id)
  session.cancelConnect?.(new Error(error || 'Disconnected'))
  session.cancelConnect = undefined
  closeClient(session.client)
  if (session.tunnel) {
    await session.tunnel.close().catch(() => undefined)
  }
  emitStatus(id, error ? 'error' : 'disconnected', error)
  appendLog('info', 'zk', `Disconnected ${session.profile.name}${error ? `: ${error}` : ''}`)
}

export async function disconnectAll(): Promise<void> {
  const ids = [...sessions.keys()]
  for (const id of ids) {
    await disconnect(id)
  }
}

function watchChildren(session: Session & { client: Client }, path: string): void {
  if (!isLive(session)) return
  const key = `c:${path}`
  if (session.watchedPaths.has(key)) return
  session.watchedPaths.add(key)
  const watcher = () => {
    session.watchedPaths.delete(key)
    if (!isLive(session)) return
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.events.nodeChildrenChanged, { id: session.id, path })
    }
    watchChildren(session, path)
  }
  session.client.getChildren(path, watcher, (err) => {
    if (err) session.watchedPaths.delete(key)
  })
}

function watchData(session: Session & { client: Client }, path: string): void {
  if (!isLive(session)) return
  const key = `d:${path}`
  if (session.watchedPaths.has(key)) return
  session.watchedPaths.add(key)
  const watcher = () => {
    session.watchedPaths.delete(key)
    if (!isLive(session)) return
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.events.nodeDataChanged, { id: session.id, path })
    }
    watchData(session, path)
  }
  session.client.getData(path, watcher, (err) => {
    if (err) session.watchedPaths.delete(key)
  })
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
      else if (!st) reject(new Error(`No stat returned for ${path}`))
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
  if (!path || path === '/' || !path.startsWith('/')) {
    throw new Error('Invalid path')
  }
  let mode = CreateMode.PERSISTENT
  if (ephemeral && sequential) mode = CreateMode.EPHEMERAL_SEQUENTIAL
  else if (ephemeral) mode = CreateMode.EPHEMERAL
  else if (sequential) mode = CreateMode.PERSISTENT_SEQUENTIAL

  // mkdirp applies data and mode to every ancestor. Create parents empty and
  // persistent, then create only the leaf with the requested payload and mode.
  const parent = path.slice(0, path.lastIndexOf('/')) || '/'
  if (parent !== '/') {
    await new Promise<void>((resolve, reject) => {
      try {
        session.client.mkdirp(parent, Buffer.alloc(0), OPEN_ACL, CreateMode.PERSISTENT, (err) => {
          if (err) reject(err)
          else resolve()
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  const created = await new Promise<string>((resolve, reject) => {
    session.client.create(path, Buffer.from(data ?? '', 'utf8'), OPEN_ACL, mode, (err, createdPath) => {
      if (err) reject(err)
      else resolve(createdPath)
    })
  })
  appendLog('info', 'zk', `create ${created}`)
  return created
}

export async function removeNode(id: string, path: string, recursive = false): Promise<void> {
  const session = ensureSession(id)
  if (path === '/' && !recursive) {
    throw new Error('Cannot delete root')
  }
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
  // ZooKeeper rejects removal of the root znode.
  if (path === '/') return
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
      else if (!st) reject(new Error(`No stat returned for ${path}`))
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
  const kw = keyword.trim()
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

    if (pathMatchesKeyword(path, kw)) found.push(path)

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
