# Proposal: migrate-renderer-to-react

## Why

原生 HTML/JS Renderer 已承载终端、配置、规则、宏、模拟器与独立窗口，状态和事件分散在单一脚本中。测试工作台需要可组合的状态模型和节点编辑器，继续增量堆叠会显著提高维护与验证成本。

## What

- 引入 React 19、Vite 与 React Flow（`@xyflow/react`）。
- 保留 Electron Main、Preload、Named Pipe JSON-RPC 和所有安全白名单不变。
- 先迁移共享应用壳、串口状态、终端收发和串口配置；其余模块逐页迁移。
- 将现有生产 Electron 自动化迁移到 React DOM 语义，保留 COM10/COM11 验收。

## Non-goals

- 不切换 Electron、C++ 后端或 IPC 协议。
- 本 change 不实现完整节点测试工作台；该能力由 `add-device-test-workbench` 在迁移基础上实现。

## Acceptance

1. `npm run start` 启动 React Renderer，Preload 仍以 contextIsolation + 受限 API 运行。
2. 终端收发、串口配置、宏、模拟器和独立窗口行为与迁移前兼容。
3. 生产 Electron 自动化和 COM10/COM11 回归通过；失败边界如实记录。

## Risk tier

`L2` — 大范围 UI 架构变更和跨模块状态迁移；不改变实际串口写入授权边界。
