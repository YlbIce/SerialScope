# Proposal: migrate-named-pipe-json-rpc

## Why

桌面应用与其本地 C++ 后端不应暴露 localhost WebSocket 端口。Named Pipe 能将 IPC 限制在 Windows 当前用户边界；JSON-RPC 2.0 则提供请求 ID、标准错误与通知语义，为模拟下位机、宏和独立窗口提供统一契约。

## What

- 以 Windows Named Pipe 替换 C++ 后端的 TCP/WebSocket 服务端。
- 使用第三方 `json-rpc-cxx` 处理 JSON-RPC 2.0 请求、响应、批处理与参数错误。
- Electron 主进程维护单条管道连接，向 Renderer 暴露受限 IPC 桥；Renderer 不再直接创建网络连接。
- 将现有端口枚举、串口开关、发送、状态和收发事件迁移为 JSON-RPC 方法与通知。
- 对单条消息实施 4 MiB 明确边界；在新链路重验最大 fixed 帧交付。

## Non-goals

- 本阶段不实现模拟下位机、独立子窗口或宏 UI；它们在管道契约稳定后单独实现。
- 不保留 WebSocket 兼容服务或监听端口。
- 不对真实物理串口执行控制性验证。

## Acceptance

1. 正常启动后，没有 TCP/WebSocket 监听端口；管道拒绝远程客户端和其他 Windows 用户。威胁模型将同一用户的本地进程视为可信，不承诺阻止同一用户的恶意进程。
2. 端口列表、打开、关闭、发送可通过 JSON-RPC 2.0 调用完成；状态和收发数据以通知到达 Renderer。
3. COM10/COM11 定长最大帧能完整到达 Renderer，或被明确拒绝且不静默丢弃。
4. 无效 JSON-RPC、未知方法、超长消息与后端重启均产生可观察、可恢复的错误状态。

## Risk tier

`L3` — 替换 IPC 传输且引入 Named Pipe ACL、进程边界与多阶段编排；仅使用用户明确提供的 COM10/COM11 虚拟串口验证。实现、验证和归档均需遵循 L3 人工闸门。
