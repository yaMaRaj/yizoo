import Store from 'electron-store'
import { safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AppSettings, ConnectionProfile } from '../../shared/types'
import { appendLog } from '../logger'

type StoreSchema = {
  connections: ConnectionProfile[]
  settings: AppSettings
  secrets: Record<string, string>
}

const defaultSettings: AppSettings = {
  locale: 'zh',
  fontSize: 14,
  monitorIntervalMs: 5000,
  theme: 'light',
}

const store = new Store<StoreSchema>({
  name: 'yizoo',
  defaults: {
    connections: [],
    settings: defaultSettings,
    secrets: {},
  },
})

function secretKey(connectionId: string, field: string): string {
  return `${connectionId}:${field}`
}

function encrypt(value: string): string {
  if (!value) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value, 'utf8').toString('base64')
}

function decrypt(value: string): string {
  if (!value) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    }
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

export function getSettings(): AppSettings {
  return { ...defaultSettings, ...store.get('settings') }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  store.set('settings', next)
  return next
}

export function listConnections(): ConnectionProfile[] {
  return store.get('connections').map(hydrateSecrets)
}

function stripSecrets(profile: ConnectionProfile): ConnectionProfile {
  const copy: ConnectionProfile = structuredClone(profile)
  if (copy.ssh) {
    delete copy.ssh.password
    delete copy.ssh.passphrase
  }
  if (copy.auth) {
    delete copy.auth.auth
  }
  return copy
}

function persistSecrets(profile: ConnectionProfile): void {
  const secrets = store.get('secrets')
  if (profile.ssh?.password) {
    secrets[secretKey(profile.id, 'sshPassword')] = encrypt(profile.ssh.password)
  }
  if (profile.ssh?.passphrase) {
    secrets[secretKey(profile.id, 'sshPassphrase')] = encrypt(profile.ssh.passphrase)
  }
  if (profile.auth?.auth) {
    secrets[secretKey(profile.id, 'zkAuth')] = encrypt(profile.auth.auth)
  }
  store.set('secrets', secrets)
}

function hydrateSecrets(profile: ConnectionProfile): ConnectionProfile {
  const secrets = store.get('secrets')
  const copy = structuredClone(profile)
  const sshPassword = decrypt(secrets[secretKey(profile.id, 'sshPassword')] ?? '')
  const sshPassphrase = decrypt(secrets[secretKey(profile.id, 'sshPassphrase')] ?? '')
  const zkAuth = decrypt(secrets[secretKey(profile.id, 'zkAuth')] ?? '')
  if (copy.ssh) {
    if (sshPassword) copy.ssh.password = sshPassword
    if (sshPassphrase) copy.ssh.passphrase = sshPassphrase
  }
  if (zkAuth) {
    copy.auth = { ...(copy.auth ?? {}), auth: zkAuth, scheme: copy.auth?.scheme ?? 'digest' }
  }
  return copy
}

export function saveConnection(input: ConnectionProfile): ConnectionProfile {
  const now = Date.now()
  const connections = store.get('connections')
  const existingIdx = connections.findIndex((c) => c.id === input.id)
  const profile: ConnectionProfile = {
    ...input,
    id: input.id || randomUUID(),
    createdAt: existingIdx >= 0 ? connections[existingIdx].createdAt : now,
    updatedAt: now,
  }
  persistSecrets(profile)
  const stored = stripSecrets(profile)
  if (existingIdx >= 0) connections[existingIdx] = stored
  else connections.push(stored)
  store.set('connections', connections)
  appendLog('info', 'config', `Saved connection ${profile.name}`)
  return hydrateSecrets(stored)
}

export function removeConnection(id: string): void {
  const connections = store.get('connections').filter((c) => c.id !== id)
  store.set('connections', connections)
  const secrets = store.get('secrets')
  for (const key of Object.keys(secrets)) {
    if (key.startsWith(`${id}:`)) delete secrets[key]
  }
  store.set('secrets', secrets)
  appendLog('info', 'config', `Removed connection ${id}`)
}

export function getConnection(id: string): ConnectionProfile | undefined {
  return listConnections().find((c) => c.id === id)
}

export function exportProfiles(includeSecrets: boolean): string {
  const profiles = includeSecrets
    ? listConnections()
    : store.get('connections').map((p) => stripSecrets(p))
  return JSON.stringify({ version: 1, exportedAt: Date.now(), profiles }, null, 2)
}

export function importProfiles(json: string, merge: boolean): ConnectionProfile[] {
  const parsed = JSON.parse(json) as { profiles?: ConnectionProfile[] }
  if (!parsed.profiles || !Array.isArray(parsed.profiles)) {
    throw new Error('Invalid import file')
  }
  if (!merge) {
    store.set('connections', [])
    store.set('secrets', {})
  }
  const result: ConnectionProfile[] = []
  for (const p of parsed.profiles) {
    result.push(
      saveConnection({
        ...p,
        id: merge ? randomUUID() : p.id || randomUUID(),
      }),
    )
  }
  appendLog('info', 'config', `Imported ${result.length} connection(s)`)
  return result
}
