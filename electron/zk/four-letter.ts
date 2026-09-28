import { Socket } from 'node:net'

const DEFAULT_TIMEOUT_MS = 2000

export async function sendFourLetter(
  host: string,
  port: number,
  command: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const cmd = command.trim().toLowerCase()
  if (!/^[a-z]{4}$/.test(cmd)) {
    throw new Error('Four-letter command must be exactly 4 letters')
  }

  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false
    const chunks: Buffer[] = []

    const finish = (err?: Error, data?: string) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      if (err) reject(err)
      else resolve(data ?? '')
    }

    socket.setTimeout(timeoutMs)
    socket.connect(port, host, () => {
      // ZK accepts bare 4lw; some setups also accept trailing newline
      socket.write(cmd)
    })
    socket.on('data', (buf) => chunks.push(buf))
    socket.on('end', () => finish(undefined, Buffer.concat(chunks).toString('utf8')))
    socket.on('close', () => finish(undefined, Buffer.concat(chunks).toString('utf8')))
    socket.on('timeout', () => finish(new Error(`4lw timeout: ${cmd}`)))
    socket.on('error', (err) => finish(err))
  })
}

export function parseMntr(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const sp = trimmed.indexOf('\t')
    if (sp > 0) {
      out[trimmed.slice(0, sp)] = trimmed.slice(sp + 1)
      continue
    }
    const m = trimmed.match(/^(\S+)\s+(\S.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

export function parseSrvr(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      out[line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_')] = line
        .slice(idx + 1)
        .trim()
    }
  }
  return out
}
