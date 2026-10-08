import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { MonitorAlert, MonitorSample } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { getSettings } from '../store/config'
import { getProfileHosts, getSessionEndpoint, getStatus } from './session-manager'
import { parseMntr, parseSrvr, sendFourLetter } from './four-letter'
import { appendLog } from '../logger'

const HISTORY_LIMIT = 60

type MonitorState = {
  timer?: NodeJS.Timeout
  latest: MonitorSample[]
  history: Map<string, MonitorSample[]>
  alerts: MonitorAlert[]
  lastMode: Map<string, string>
  lastRuok: Map<string, boolean | 'unknown'>
  lastLatencyAlertAt: Map<string, number>
  lastAlertKey: Map<string, number>
}

const monitors = new Map<string, MonitorState>()

function ensureState(id: string): MonitorState {
  let s = monitors.get(id)
  if (!s) {
    s = {
      latest: [],
      history: new Map(),
      alerts: [],
      lastMode: new Map(),
      lastRuok: new Map(),
      lastLatencyAlertAt: new Map(),
      lastAlertKey: new Map(),
    }
    monitors.set(id, s)
  }
  return s
}

function pushAlertOnce(
  id: string,
  alert: Omit<MonitorAlert, 'id' | 'ts'>,
  dedupeKey: string,
  cooldownMs = 60_000,
): void {
  const state = ensureState(id)
  const now = Date.now()
  const prev = state.lastAlertKey.get(dedupeKey) ?? 0
  if (now - prev < cooldownMs) return
  state.lastAlertKey.set(dedupeKey, now)

  const full: MonitorAlert = { ...alert, id: randomUUID(), ts: now }
  state.alerts.unshift(full)
  if (state.alerts.length > 100) state.alerts.length = 100
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.events.monitorAlert, { id, alert: full })
  }
}

function isWhitelistDenied(raw: string): boolean {
  const t = raw.toLowerCase()
  return t.includes('not in the whitelist') || t.includes('is not executed')
}

async function sampleHost(
  connectionId: string,
  host: string,
  port: number,
  sessionConnected: boolean,
): Promise<MonitorSample> {
  const base: MonitorSample = { ts: Date.now(), host, port, ruok: false }
  let fourLetterBlocked = false

  try {
    const ruok = await sendFourLetter(host, port, 'ruok')
    if (isWhitelistDenied(ruok)) {
      fourLetterBlocked = true
      // Session is up → treat as healthy; 4lw just disabled on server
      base.ruok = sessionConnected
      base.error = sessionConnected
        ? '4lw ruok not whitelisted (using session health)'
        : '4lw ruok not whitelisted'
    } else {
      base.ruok = ruok.trim().toLowerCase().includes('imok')
      if (!base.ruok && ruok.trim()) {
        base.error = `ruok response: ${ruok.trim().slice(0, 80)}`
      }
    }
  } catch (err) {
    // TCP failed — if ZK session is connected to this endpoint, still mark ok-ish
    base.error = err instanceof Error ? err.message : String(err)
    base.ruok = false
    if (sessionConnected) {
      // Keep showing metrics attempt via mntr; don't force ruok true on connect errors
    }
    // continue to try mntr/srvr in case only ruok failed oddly
  }

  try {
    const mntrRaw = await sendFourLetter(host, port, 'mntr')
    if (isWhitelistDenied(mntrRaw)) {
      fourLetterBlocked = true
    } else if (mntrRaw.trim()) {
      const m = parseMntr(mntrRaw)
      base.raw = m
      base.mode = m.zk_server_state
      base.latencyAvg = num(m.zk_avg_latency)
      base.latencyMax = num(m.zk_max_latency)
      base.packetsReceived = num(m.zk_packets_received)
      base.packetsSent = num(m.zk_packets_sent)
      base.numAliveConnections = num(m.zk_num_alive_connections)
      base.outstandingRequests = num(m.zk_outstanding_requests)
      base.znodeCount = num(m.zk_znode_count)
      base.watchCount = num(m.zk_watch_count)
      base.zxid = m.zk_zxid
      // Got mntr → server is alive even if ruok blocked
      if (fourLetterBlocked || !base.ruok) base.ruok = true
      if (fourLetterBlocked) base.error = '4lw partially whitelisted (mntr ok)'
      return base
    }
  } catch {
    /* fallback */
  }

  try {
    const srvrRaw = await sendFourLetter(host, port, 'srvr')
    if (isWhitelistDenied(srvrRaw)) {
      fourLetterBlocked = true
      if (sessionConnected) {
        base.ruok = true
        base.error = '4lw not whitelisted (using session health)'
      }
    } else if (srvrRaw.trim()) {
      const s = parseSrvr(srvrRaw)
      base.raw = s
      base.mode = s.mode
      base.zxid = s.zxid
      base.latencyAvg = num(s.latency?.split('/')?.[1])
      base.numAliveConnections = num(s.connections)
      base.znodeCount = num(s.node_count)
      base.ruok = true
      if (fourLetterBlocked) base.error = undefined
    }
  } catch (err) {
    if (!base.error) base.error = err instanceof Error ? err.message : String(err)
  }

  // Final fallback: ZK client session is connected
  if (!base.ruok && sessionConnected && !base.error?.includes('ECONNREFUSED')) {
    base.ruok = true
    base.error = fourLetterBlocked
      ? '4lw not whitelisted (using session health)'
      : '4lw unavailable (using session health)'
  }

  return base
}

function num(v?: string): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function tick(id: string): Promise<void> {
  const status = getStatus(id)
  if (status !== 'connected' && status !== 'reconnecting') {
    return
  }
  const sessionConnected = status === 'connected' || status === 'reconnecting'
  const state = ensureState(id)
  const endpoint = getSessionEndpoint(id)

  // Prefer the live session endpoint only (avoids probing remote host when tunneled,
  // and avoids false ruok failures against unreachable advertised hosts).
  let hosts: Array<{ host: string; port: number }> = []
  if (endpoint) {
    hosts = [endpoint]
  } else {
    hosts = getProfileHosts(id)
  }

  const samples: MonitorSample[] = []
  for (const h of hosts) {
    const sample = await sampleHost(id, h.host, h.port, sessionConnected)
    samples.push(sample)
    const key = `${h.host}:${h.port}`
    const hist = state.history.get(key) ?? []
    hist.push(sample)
    if (hist.length > HISTORY_LIMIT) hist.splice(0, hist.length - HISTORY_LIMIT)
    state.history.set(key, hist)

    const prevRuok = state.lastRuok.get(key)
    const curRuok: boolean | 'unknown' = sample.ruok
    // Only alert on transition to unhealthy
    if (!sample.ruok && prevRuok !== false) {
      pushAlertOnce(
        id,
        {
          severity: 'critical',
          host: key,
          message: sample.error ? `Unhealthy: ${sample.error}` : 'ruok failed (not imok)',
        },
        `ruok-fail:${key}`,
        120_000,
      )
    }
    state.lastRuok.set(key, curRuok)

    if (sample.mode) {
      const prev = state.lastMode.get(key)
      if (prev && prev !== sample.mode) {
        pushAlertOnce(
          id,
          {
            severity: 'warn',
            host: key,
            message: `Role changed ${prev} → ${sample.mode}`,
          },
          `mode:${key}:${sample.mode}`,
          30_000,
        )
      }
      state.lastMode.set(key, sample.mode)
    }

    if ((sample.latencyAvg ?? 0) > 100) {
      const lastAt = state.lastLatencyAlertAt.get(key) ?? 0
      if (Date.now() - lastAt > 120_000) {
        state.lastLatencyAlertAt.set(key, Date.now())
        pushAlertOnce(
          id,
          {
            severity: 'warn',
            host: key,
            message: `High avg latency: ${sample.latencyAvg} ms`,
          },
          `latency:${key}`,
          120_000,
        )
      }
    }
  }

  state.latest = samples
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.events.monitorSample, { id, samples })
  }
}

export function startMonitor(id: string): void {
  const state = ensureState(id)
  if (state.timer) return
  const interval = getSettings().monitorIntervalMs || 5000
  const run = () => {
    tick(id).catch((err) => appendLog('error', 'monitor', String(err)))
  }
  run()
  state.timer = setInterval(run, interval)
  appendLog('info', 'monitor', `Started monitor for ${id}`)
}

export function stopMonitor(id: string): void {
  const state = monitors.get(id)
  if (!state) return
  if (state.timer) clearInterval(state.timer)
  monitors.delete(id)
  appendLog('info', 'monitor', `Stopped monitor for ${id}`)
}

export function restartAllMonitors(): void {
  for (const [id, state] of monitors) {
    if (!state.timer) continue
    clearInterval(state.timer)
    state.timer = undefined
    startMonitor(id)
  }
}

export function getLatest(id: string): MonitorSample[] {
  return ensureState(id).latest
}

export function getHistory(id: string, host: string): MonitorSample[] {
  return ensureState(id).history.get(host) ?? []
}

export function getAlerts(id: string): MonitorAlert[] {
  return ensureState(id).alerts
}
