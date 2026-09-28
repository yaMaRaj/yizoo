# YIZoo

Modern ZooKeeper desktop client built with Electron + React + TypeScript.

## Features

- Multi-connection management with encrypted secrets (Electron `safeStorage`)
- Node tree browse / CRUD / search with live watchers
- Monaco editor with JSON / XML / Properties highlighting and pretty-format
- ACL view & edit
- SSH tunnel (password / private key)
- Config import / export
- ZooKeeper CLI terminal with **command syntax highlighting**, Tab completion, history
- Cluster **Monitor** dashboard (`ruok` / `mntr` / `srvr`) with sparklines and alerts
- 4-letter command panel
- Log board, i18n (zh/en), global font size

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist
```

Produces an unpacked app at `release/win-unpacked/YIZoo.exe`.

> On some Windows environments, NSIS/portable packaging may fail while extracting `winCodeSign` (symlink privilege). Use the unpacked folder or zip it manually. Enable Developer Mode or run as admin if you need installer targets.
