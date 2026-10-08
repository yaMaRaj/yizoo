import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useAppStore } from '../../store/app-store'
import 'xterm/css/xterm.css'
import { highlightLine, COMMANDS } from './highlight'

export function TerminalPane() {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const lineRef = useRef('')
  const historyRef = useRef<string[]>([])
  const histIdxRef = useRef(-1)
  const busyRef = useRef(false)
  const activeId = useAppStore((s) => s.activeId)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#151a21',
        foreground: '#e7ecf2',
        cursor: '#7dcea0',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const writePrompt = () => {
      term.write('\r\n')
      redrawInput(term, '')
      lineRef.current = ''
    }

    term.writeln('YIZoo ZooKeeper shell — type help')
    redrawInput(term, '')

    const onData = (data: string) => {
      if (busyRef.current) return
      const id = useAppStore.getState().activeId

      if (data === '\x1b[A') {
        const hist = historyRef.current
        if (!hist.length) return
        if (histIdxRef.current < 0) histIdxRef.current = hist.length
        histIdxRef.current = Math.max(0, histIdxRef.current - 1)
        lineRef.current = hist[histIdxRef.current] ?? ''
        redrawInput(term, lineRef.current)
        return
      }
      if (data === '\x1b[B') {
        const hist = historyRef.current
        if (histIdxRef.current < 0) return
        histIdxRef.current += 1
        if (histIdxRef.current >= hist.length) {
          histIdxRef.current = -1
          lineRef.current = ''
        } else {
          lineRef.current = hist[histIdxRef.current] ?? ''
        }
        redrawInput(term, lineRef.current)
        return
      }
      if (data === '\t') {
        if (!id) return
        void complete(term, id, lineRef)
        return
      }
      if (data === '\r') {
        const line = lineRef.current
        term.write('\r\n')
        if (!id) {
          term.writeln('\x1b[31mNot connected\x1b[0m')
          writePrompt()
          return
        }
        if (!line.trim()) {
          writePrompt()
          return
        }
        historyRef.current.push(line)
        histIdxRef.current = -1
        busyRef.current = true
        void window.yizoo.zk
          .executeCli(id, line)
          .then((res) => {
            const color = res.ok ? '' : '\x1b[31m'
            for (const outLine of (res.output || '').split('\n')) {
              term.writeln(`${color}${outLine}\x1b[0m`)
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            term.writeln(`\x1b[31m${msg}\x1b[0m`)
          })
          .finally(() => {
            busyRef.current = false
            writePrompt()
          })
        return
      }
      if (data === '\x7f' || data === '\b') {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1)
          redrawInput(term, lineRef.current)
        }
        return
      }
      if (data.startsWith('\x1b')) return
      if (data.length === 1 && data.charCodeAt(0) < 32) return

      lineRef.current += data
      redrawInput(term, lineRef.current)
    }

    const disposable = term.onData(onData)
    const onResize = () => fit.fit()
    window.addEventListener('resize', onResize)
    return () => {
      disposable.dispose()
      window.removeEventListener('resize', onResize)
      term.dispose()
      termRef.current = null
    }
  }, [])

  useEffect(() => {
    fitRef.current?.fit()
  }, [activeId])

  return <div className="terminal-wrap" ref={hostRef} />
}

function redrawInput(term: Terminal, line: string) {
  term.write('\r\x1b[K')
  term.write('\x1b[38;2;15;110;86m[yizoo]\x1b[0m ')
  term.write(highlightLine(line))
}

async function complete(
  term: Terminal,
  id: string,
  lineRef: { current: string },
) {
  const line = lineRef.current
  const parts = line.split(/\s+/)
  if (parts.length <= 1) {
    const prefix = parts[0] ?? ''
    const matches = COMMANDS.filter((c) => c.toLowerCase().startsWith(prefix.toLowerCase()))
    if (matches.length === 1) {
      lineRef.current = matches[0] + ' '
      redrawInput(term, lineRef.current)
    } else if (matches.length > 1) {
      term.write('\r\n' + matches.join('  '))
      redrawInput(term, line)
    }
    return
  }
  const partial = parts[parts.length - 1] ?? ''
  if (!partial.startsWith('/')) return
  const matches = await window.yizoo.zk.completePath(id, partial)
  if (matches.length === 1) {
    parts[parts.length - 1] = matches[0]
    lineRef.current = parts.join(' ') + ' '
    redrawInput(term, lineRef.current)
  } else if (matches.length > 1) {
    term.write('\r\n' + matches.join('  '))
    redrawInput(term, line)
  }
}
