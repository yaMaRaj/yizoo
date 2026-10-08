export type HostPort = {
  host: string
  port: number
}

/** Parse one ensemble token: `host`, `host:port`, or `[ipv6]:port`. */
export function parseHostToken(token: string, defaultPort: number): HostPort | null {
  const trimmed = token.trim()
  if (!trimmed) return null

  const bracket = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (bracket) {
    const port = bracket[2] ? Number(bracket[2]) : defaultPort
    if (!isValidPort(port)) return null
    return { host: bracket[1], port }
  }

  const simple = trimmed.match(/^([^:\s]+):(\d+)$/)
  if (simple) {
    const port = Number(simple[2])
    if (!isValidPort(port)) return null
    return { host: simple[1], port }
  }

  if (!isValidPort(defaultPort)) return null
  return { host: trimmed, port: defaultPort }
}

export function parseEnsemble(hostField: string, defaultPort: number): HostPort[] {
  return hostField
    .split(',')
    .map((part) => parseHostToken(part, defaultPort))
    .filter((item): item is HostPort => item != null && item.host.length > 0)
}

export function formatEnsemble(hosts: HostPort[]): string {
  return hosts.map((item) => `${item.host}:${item.port}`).join(',')
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}
