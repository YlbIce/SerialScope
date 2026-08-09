# 仓库地图与验证入口

## 运行时代码

| 范围 | 位置 | 说明 |
| --- | --- | --- |
| Electron 主进程 | `src/main/main.js` | 窗口、后端子进程、受控文件 IPC |
| Electron preload | `src/main/preload.js` | Renderer 可调用 API 白名单 |
| Renderer | `src/renderer/` | HTML、样式与串口工具 UI；当前前端仍以单个 `renderer.js` 为主 |
| C++ 后端 | `backend/src/` | WebSocket、串口会话、协议工具 |
| 后端构建 | `backend/CMakeLists.txt`、`scripts/build-backend.ps1` | MSVC/CMake/vcpkg 构建路径 |
| 启动与模拟 | `scripts/run-electron.js`、`scripts/mock-backend.js` | 开发启动与无硬件模拟 |

## 验证命令

| 命令 | kind | 当前证明范围 | 不证明 |
| --- | --- | --- | --- |
| `npm run process:check` | process-contract | 变更包结构与 JSON 证据块可解析 | 产品行为、硬件行为 |
| `npm run check` | syntax-check | 主进程、preload、renderer 与脚本可被 Node 解析 | Electron UI、C++ 构建、真实串口 |
| `npm run build:backend` | native-build | C++ 后端可在满足本机依赖时构建 | 真实串口协议兼容性 |
| `npm run dev` | manual-smoke | 人工启动桌面应用 | 自动化回归、真实设备安全性 |

新增可执行验证时，应更新本页、`package.json` 及相应 change 的场景映射；不要把未运行的硬件验证写成通过。
