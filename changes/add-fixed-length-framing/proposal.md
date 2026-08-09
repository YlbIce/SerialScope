# Proposal: add-fixed-length-framing

## Why

许多二进制设备按固定长度发送报文，不具备换行等终止符。raw 模式会暴露读取块，delimiter 模式不适用，需要一个明确且有界的 fixed 帧策略。

## What

- 为后端 FrameDecoder 增加 `fixed` 模式和 `frameSize` 配置。
- 跨读取块累计，恰好每 `frameSize` 字节发出一条 RX 帧。
- Renderer 提供定长帧配置；raw/delimiter 现有行为保持不变。
- 扩展原生测试与 COM10/COM11 虚拟串口验证。

## Non-goals

- 不实现空闲超时、长度字段、校验和或协议插件。
- 不改变发送字节或操作真实设备。

## Acceptance

1. `frameSize=4` 下接收 `01 02 03 04 05 06` 时先发出前四字节；补 `07 08` 后发出后四字节。
2. 非法或超出上限的 `frameSize` 被拒绝，现有连接不被关闭。
3. raw 与 delimiter 现有测试继续通过。

## Risk tier

`L2` — 改变 `serial:open` framing 配置和接收帧语义，但不涉及真实设备写入。

## Supersession note

定长分帧的整数校验与零值防御已修复，但最大帧的端到端验证在现有 WebSocket 实时队列上未通过。该问题将由 `migrate-named-pipe-json-rpc` 在替换传输层后重新验收；本 change 保持 `blocked`，不得归档。
