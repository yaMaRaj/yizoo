import { Menu, BrowserWindow, app } from 'electron'
import { IPC } from '../shared/ipc'

export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const send = (channel: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.send(channel)
  }

  const windowSubmenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'minimize' },
    { role: 'zoom' },
  ]
  if (isMac) {
    windowSubmenu.push({ type: 'separator' }, { role: 'front' })
  } else {
    windowSubmenu.push({ role: 'close' })
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Connections…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send(IPC.events.menuImport),
        },
        {
          label: 'Export Connections…',
          accelerator: 'CmdOrCtrl+E',
          click: () => send(IPC.events.menuExport),
        },
        {
          label: 'Export With Secrets…',
          click: () => send(IPC.events.menuExportSecrets),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: windowSubmenu,
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About YIZoo',
          click: () => undefined,
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
