/** ANSI color helpers for ZK CLI syntax highlighting */
const C = {
  reset: '\x1b[0m',
  cmd: '\x1b[38;2;109;179;242m', // blue
  path: '\x1b[38;2;125;206;160m', // green
  flag: '\x1b[38;2;230;179;90m', // yellow
  str: '\x1b[38;2;199;146;234m', // magenta
  comment: '\x1b[38;2;120;130;145m',
}

export const COMMANDS = [
  'ls',
  'get',
  'set',
  'create',
  'delete',
  'rm',
  'rmr',
  'deleteall',
  'stat',
  'getAcl',
  'setAcl',
  'help',
]

const CMD_SET = new Set(COMMANDS.map((c) => c.toLowerCase()))

export function highlightLine(line: string): string {
  if (!line) return ''
  const tokens = tokenize(line)
  return tokens
    .map((tok) => {
      if (tok.type === 'ws') return tok.value
      if (tok.type === 'cmd') return C.cmd + tok.value + C.reset
      if (tok.type === 'flag') return C.flag + tok.value + C.reset
      if (tok.type === 'path') return C.path + tok.value + C.reset
      if (tok.type === 'str') return C.str + tok.value + C.reset
      return tok.value
    })
    .join('')
}

type Tok = { type: 'ws' | 'cmd' | 'flag' | 'path' | 'str' | 'text'; value: string }

function tokenize(line: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  let index = 0
  while (i < line.length) {
    if (/\s/.test(line[i])) {
      let j = i
      while (j < line.length && /\s/.test(line[j])) j++
      out.push({ type: 'ws', value: line.slice(i, j) })
      i = j
      continue
    }
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i]
      let j = i + 1
      while (j < line.length && line[j] !== q) j++
      if (j < line.length) j++
      out.push({ type: 'str', value: line.slice(i, j) })
      i = j
      index++
      continue
    }
    let j = i
    while (j < line.length && !/\s/.test(line[j])) j++
    const raw = line.slice(i, j)
    let type: Tok['type'] = 'text'
    if (index === 0 && CMD_SET.has(raw.toLowerCase())) type = 'cmd'
    else if (raw.startsWith('-')) type = 'flag'
    else if (raw.startsWith('/')) type = 'path'
    else if (index > 0) type = 'str'
    out.push({ type, value: raw })
    index++
    i = j
  }
  return out
}
