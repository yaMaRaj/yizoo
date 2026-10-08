import type { CliResult } from '../../shared/types'
import * as zk from './session-manager'

function tokenize(line: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }
  if (cur) tokens.push(cur)
  return tokens
}

function formatStat(stat: Awaited<ReturnType<typeof zk.getData>>['stat']): string {
  return [
    `czxid = ${stat.czxid}`,
    `mzxid = ${stat.mzxid}`,
    `ctime = ${new Date(stat.ctime).toISOString()}`,
    `mtime = ${new Date(stat.mtime).toISOString()}`,
    `version = ${stat.version}`,
    `cversion = ${stat.cversion}`,
    `aversion = ${stat.aversion}`,
    `ephemeralOwner = ${stat.ephemeralOwner}`,
    `dataLength = ${stat.dataLength}`,
    `numChildren = ${stat.numChildren}`,
    `pzxid = ${stat.pzxid}`,
  ].join('\n')
}

export async function executeCli(id: string, line: string): Promise<CliResult> {
  const trimmed = line.trim()
  if (!trimmed) return { ok: true, output: '' }

  const tokens = tokenize(trimmed)
  const cmd = tokens[0]?.toLowerCase()
  try {
    switch (cmd) {
      case 'help':
      case '?':
        return {
          ok: true,
          output: [
            'Commands:',
            '  ls [path]',
            '  get <path>',
            '  set <path> <data>',
            '  create [-e] [-s] <path> [data]',
            '  delete <path>',
            '  rmr <path>',
            '  stat <path>',
            '  getAcl <path>',
            '  setAcl <path> <scheme:id:perms>...',
            '  help',
          ].join('\n'),
        }
      case 'ls': {
        const path = tokens[1] || '/'
        const children = await zk.listChildren(id, path)
        return { ok: true, output: `[${children.map((c) => c.name).join(', ')}]` }
      }
      case 'get': {
        const path = tokens[1]
        if (!path) throw new Error('Usage: get <path>')
        const node = await zk.getData(id, path)
        return { ok: true, output: `${node.data}\n\n${formatStat(node.stat)}` }
      }
      case 'set': {
        const path = tokens[1]
        const data = tokens.slice(2).join(' ')
        if (!path) throw new Error('Usage: set <path> <data>')
        const stat = await zk.setData(id, path, data)
        return { ok: true, output: formatStat(stat) }
      }
      case 'create': {
        let ephemeral = false
        let sequential = false
        const rest: string[] = []
        for (const t of tokens.slice(1)) {
          if (t === '-e') ephemeral = true
          else if (t === '-s') sequential = true
          else rest.push(t)
        }
        const path = rest[0]
        const data = rest.slice(1).join(' ')
        if (!path) throw new Error('Usage: create [-e] [-s] <path> [data]')
        const created = await zk.createNode(id, path, data, ephemeral, sequential)
        return { ok: true, output: `Created ${created}` }
      }
      case 'delete':
      case 'rm': {
        const path = tokens[1]
        if (!path) throw new Error('Usage: delete <path>')
        await zk.removeNode(id, path, false)
        return { ok: true, output: `Deleted ${path}` }
      }
      case 'rmr':
      case 'deleteall': {
        const path = tokens[1]
        if (!path) throw new Error('Usage: rmr <path>')
        await zk.removeNode(id, path, true)
        return { ok: true, output: `Deleted recursively ${path}` }
      }
      case 'stat': {
        const path = tokens[1]
        if (!path) throw new Error('Usage: stat <path>')
        const node = await zk.getData(id, path)
        return { ok: true, output: formatStat(node.stat) }
      }
      case 'getacl': {
        const path = tokens[1]
        if (!path) throw new Error('Usage: getAcl <path>')
        const { acls, stat } = await zk.getAcl(id, path)
        const lines = acls.map((a) => `${a.scheme}:${a.id}:${a.perms}`)
        return { ok: true, output: `${lines.join('\n')}\n\n${formatStat(stat)}` }
      }
      case 'setacl': {
        const path = tokens[1]
        const specs = tokens.slice(2)
        if (!path || specs.length === 0) {
          throw new Error('Usage: setAcl <path> <scheme:id:perms>...')
        }
        const acls = specs.map((spec) => {
          const parts = spec.split(':')
          if (parts.length < 3) throw new Error(`Invalid ACL: ${spec}`)
          const perms = Number(parts[parts.length - 1])
          if (!Number.isInteger(perms)) throw new Error(`Invalid ACL perms: ${spec}`)
          const scheme = parts[0]
          const idPart = parts.slice(1, -1).join(':')
          return { scheme, id: idPart, perms }
        })
        const stat = await zk.setAcl(id, path, acls)
        return { ok: true, output: formatStat(stat) }
      }
      default:
        return { ok: false, output: `Unknown command: ${cmd}. Type help` }
    }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}
