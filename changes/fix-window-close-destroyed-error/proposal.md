# Proposal: fix-window-close-destroyed-error

## Why

用户关闭应用窗口时，主进程抛出未捕获异常：

```
Uncaught Exception:
TypeError: Object has been destroyed
at BrowserWindow.<anonymous> (src/main/main.js:287:35)
at BrowserWindow.emit (node:events:531:35)
```

## Root cause

`main.js` 的窗口 `closed` 事件回调（第 285-292 行）里，第 287 行执行了 `workbenchExecution.end(target.webContents.id)`。Electron 中 `closed` 事件触发时 **BrowserWindow 及其 webContents 已经销毁**，此时访问 `target.webContents.id` 会抛 `Object has been destroyed`。由于这是事件回调里的同步异常，未被任何 try/catch 捕获，导致主进程 UncaughtException，弹窗报错。

## Fix

窗口创建时第 254 行已缓存 `const webContentsId = target.webContents.id`。把 `closed` 回调里的 `target.webContents.id` 改为缓存的 `webContentsId`，并对 `workbenchExecution.end()` 加 try/catch 兜底，避免未来代码变更再次踩坑。

## Why L1

- 局部一行修复，公开契约不变（`workbenchExecution.end(senderId)` 签名与语义不变，只是入参来源改为缓存值）。
- 不改变任何 IPC / RPC 契约，不改变窗口创建/销毁逻辑的对外行为。
- 采用 L1 短路径：直接修改 → 定向验证 → 记录。
