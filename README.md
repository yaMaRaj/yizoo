# YIZoo (Go + Wails)

ZooKeeper 桌面客户端的 **Go + Wails** 重构分支（`go-wails`）。

- **后端**：Go（`go-zookeeper/zk` 直连 ZK，SSH 隧道可选）
- **前端**：React + Vite（核心页：连接 / 树 / 读写；Monaco、终端、监控后置）
- **桌面壳**：Wails v2

Electron 旧实现保留在 [`legacy-electron/`](./legacy-electron/) 供对照。

## 已实现（v0.1）

- 连接配置：新建 / 编辑 / 删除 / 复制 / 重命名
- 建连 / 断开（PLAINTEXT、digest 认证、SSH 隧道）
- 节点树懒加载
- 节点数据读写、新建、删除 / 递归删除
- 工作区内切换连接

## 开发

前置：Go 1.22+、Node 18+、[Wails CLI](https://wails.io)

```bash
cd frontend && npm install && cd ..
wails dev
```

仅前端（无 Go 绑定，浏览器调试 UI）：

```bash
cd frontend
npm run dev
```

## 打包

```bash
wails build
```

产物在 `build/bin/`。

## 目录

```
├── app.go                 # Wails 绑定
├── main.go
├── internal/
│   ├── model/             # 共享结构
│   ├── store/             # %AppData%/yizoo/config.json
│   └── zk/                # 会话、树、读写、SSH
├── frontend/              # React 核心页
└── legacy-electron/       # 原 Electron 实现
```

## 后续

- Monaco / JSON·XML 视图
- xterm CLI、4lw、监控面板
- 密钥落盘加密、i18n 完整迁移
