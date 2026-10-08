import { Client, ConnectConfig } from 'ssh2'
import { createServer, Server, AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import type { SshConfig } from '../../shared/types'
import { appendLog } from '../logger'

export type TunnelHandle = {
  localPort: number
  close: () => Promise<void>
  onUnexpectedClose: (cb: () => void) => void
}

export async function openSshTunnel(
  ssh: SshConfig,
  remoteHost: string,
  remotePort: number,
): Promise<TunnelHandle> {
  if (!ssh.enabled) {
    throw new Error('SSH is not enabled')
  }

  const conn = new Client()
  const config: ConnectConfig = {
    host: ssh.host,
    port: ssh.port || 22,
    username: ssh.username,
    readyTimeout: 20000,
  }
  if (ssh.privateKeyPath) {
    config.privateKey = readFileSync(ssh.privateKeyPath)
    if (ssh.passphrase) config.passphrase = ssh.passphrase
  } else if (ssh.password) {
    config.password = ssh.password
  } else {
    throw new Error('SSH requires password or private key')
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        conn.off('error', onError)
        resolve()
      }
      const onError = (err: Error) => {
        conn.off('ready', onReady)
        reject(err)
      }
      conn.once('ready', onReady).once('error', onError).connect(config)
    })
  } catch (err) {
    conn.end()
    throw err
  }

  const server: Server = createServer((socket) => {
    socket.on('error', () => socket.destroy())
    conn.forwardOut(
      socket.remoteAddress ?? '127.0.0.1',
      socket.remotePort ?? 0,
      remoteHost,
      remotePort,
      (err, stream) => {
        if (err || !stream) {
          socket.destroy()
          return
        }
        stream.on('error', () => {
          socket.destroy()
          stream.destroy()
        })
        socket.pipe(stream).pipe(socket)
      },
    )
  })

  let localPort: number
  try {
    localPort = await new Promise<number>((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      server.once('error', onError)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', onError)
        const addr = server.address() as AddressInfo
        resolve(addr.port)
      })
    })
  } catch (err) {
    server.close()
    conn.end()
    throw err
  }

  appendLog(
    'info',
    'ssh',
    `Tunnel ready localhost:${localPort} -> ${remoteHost}:${remotePort} via ${ssh.host}`,
  )

  let closed = false
  let unexpected: (() => void) | undefined

  const drop = () => {
    if (closed) return
    closed = true
    server.close()
    conn.end()
    const notify = unexpected
    unexpected = undefined
    notify?.()
  }

  conn.on('error', drop)
  conn.on('close', drop)
  server.on('error', (err) => {
    appendLog('error', 'ssh', `Tunnel server error: ${err.message}`)
    drop()
  })

  return {
    localPort,
    onUnexpectedClose(cb: () => void) {
      unexpected = cb
    },
    close: async () => {
      if (closed) return
      closed = true
      unexpected = undefined
      await new Promise<void>((resolve) => server.close(() => resolve()))
      conn.end()
      appendLog('info', 'ssh', `Tunnel closed (local ${localPort})`)
    },
  }
}
