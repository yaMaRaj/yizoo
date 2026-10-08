import { Client, ConnectConfig } from 'ssh2'
import { createServer, Server, AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import type { SshConfig } from '../../shared/types'
import { appendLog } from '../logger'

export type TunnelHandle = {
  localPort: number
  close: () => Promise<void>
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

  await new Promise<void>((resolve, reject) => {
    conn
      .on('ready', () => resolve())
      .on('error', (err) => reject(err))
      .connect(config)
  })

  const server: Server = createServer((socket) => {
    conn.forwardOut(
      socket.remoteAddress ?? '127.0.0.1',
      socket.remotePort ?? 0,
      remoteHost,
      remotePort,
      (err, stream) => {
        if (err) {
          socket.destroy()
          return
        }
        socket.pipe(stream).pipe(socket)
      },
    )
  })

  let localPort: number
  try {
    localPort = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo
        resolve(addr.port)
      })
    })
  } catch (err) {
    conn.end()
    throw err
  }

  appendLog(
    'info',
    'ssh',
    `Tunnel ready localhost:${localPort} -> ${remoteHost}:${remotePort} via ${ssh.host}`,
  )

  return {
    localPort,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      conn.end()
      appendLog('info', 'ssh', `Tunnel closed (local ${localPort})`)
    },
  }
}
