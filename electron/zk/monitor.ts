import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { MonitorAlert, MonitorSample } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { getSettings } from '../store/config'
import { getMonitorTargets, getStatus } from './session-manager'
import { parseMntr, parseSrvr, readSrvrLatencyAvg, sendFourLetter } from './four-letter'
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
  host: string,
  port: number,
  sessionFallback: boolean,
): Promise<MonitorSample> {
  const base: MonitorSample = { ts: Date.now(), host, port, ruok: false }
  let fourLetterBlocked = false

  try {
    const ruok = await sendFourLetter(host, port, 'ruok')
    if (isWhitelistDenied(ruok)) {
      fourLetterBlocked = true
      // The server answered, so the process is up even though ruok is blocked.
      base.ruok = true
      base.error = '4lw ruok not whitelisted'
    } else {
      base.ruok = ruok.trim().toLowerCase().includes('imok')
      if (!base.ruok && ruok.trim()) {
        base.error = `ruok response: ${ruok.trim().slice(0, 80)}`
      }
    }
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err)
    base.ruok = false
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
      base.ruok = true
      base.error = '4lw not whitelisted'
    } else if (srvrRaw.trim()) {
      const s = parseSrvr(srvrRaw)
      base.raw = s
      base.mode = s.mode
      base.zxid = s.zxid
      base.latencyAvg = readSrvrLatencyAvg(s)
      base.numAliveConnections = num(s.connections)
      base.znodeCount = num(s.node_count)
      base.ruok = true
      if (fourLetterBlocked) base.error = undefined
    }
  } catch (err) {
    if (!base.error) base.error = err instanceof Error ? err.message : String(err)
  }

  // A single reachable session can stand in for 4lw when the server blocks it.
  // Ensemble members are judged on their own 4lw result so a dead peer stays red.
  if (!base.ruok && sessionFallback) {
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
    // Session is gone (disconnect / failed connect). Drop the timer so it does not
    // spin forever. A live session in `error` (for example expired) keeps the timer
    // so sampling resumes if the client recovers.
    if (status === 'disconnected') {
      const state = monitors.get(id)
      if (state?.timer) {
        clearInterval(state.timer)
        state.timer = undefined
      }
    }
    return
  }
  const sessionConnected = status === 'connected' || status === 'reconnecting'
  const state = ensureState(id)
  // Tunnel sessions probe localhost only. Ensembles probe every configured host.
  const hosts = getMonitorTargets(id)
  const sessionFallback = hosts.length === 1 && sessionConnected

  const samples: MonitorSample[] = []
  for (const h of hosts) {
    const sample = await sampleHost(h.host, h.port, sessionFallback)
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

export function monitorIntervalMs(): number {
  const ms = getSettings().monitorIntervalMs
  if (!Number.isFinite(ms)) return 5000
  return Math.min(300_000, Math.max(1000, Math.round(ms)))
}

export function startMonitor(id: string): void {
  const state = ensureState(id)
  if (state.timer) return
  const run = () => {
    tick(id).catch((err) => appendLog('error', 'monitor', String(err)))
  }
  run()
  state.timer = setInterval(run, monitorIntervalMs())
  appendLog('info', 'monitor', `Started monitor for ${id}`)
}

export function restartMonitorIntervals(): void {
  const interval = monitorIntervalMs()
  for (const [id, state] of monitors) {
    if (!state.timer) continue
    clearInterval(state.timer)
    state.timer = setInterval(() => {
      tick(id).catch((err) => appendLog('error', 'monitor', String(err)))
    }, interval)
  }
}

export function stopAllMonitors(): void {
  for (const id of [...monitors.keys()]) stopMonitor(id)
}

export function stopMonitor(id: string): void {
  const state = monitors.get(id)
  if (!state) return
  if (state.timer) clearInterval(state.timer)
  state.timer = undefined
  appendLog('info', 'monitor', `Stopped monitor for ${id}`)
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
