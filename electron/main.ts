import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc/handlers'
import { appendLog } from './logger'
import { buildAppMenu } from './menu'
import { disconnectAll } from './zk/session-manager'
import { stopAllMonitors } from './zk/monitor'

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'YIZoo',
    backgroundColor: '#f4f6f8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  appendLog('info', 'app', 'YIZoo started')
}

app.whenReady().then(() => {
  registerIpc()
  buildAppMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let allowQuit = false
app.on('before-quit', (event) => {
  if (allowQuit) return
  event.preventDefault()
  allowQuit = true
  void (async () => {
    try {
      stopAllMonitors()
      await Promise.race([
        disconnectAll(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    } finally {
      app.quit()
    }
  })()
})
