# Proposal: add-delimiter-framing

## Why

当前后端把 CSerialPort 的每个读取块直接当成一帧。设备一次发送多个消息或一条消息被拆成多次读取时，日志、JSON/Modbus 解析和采样都会失真。

## What

- 在 C++ 后端引入有界字节流帧解码器。
- 支持 `raw`（默认，保持现状）和 `delimiter` 两种模式。
- `delimiter` 支持 LF、CRLF、CR 与用户提供的 HEX 分隔符。
- 串口打开配置可携带 framing 参数；Renderer 暴露模式与分隔符选择。

## Non-goals

- 不实现定长、空闲超时、长度字段、Modbus RTU 专用或可插拔协议解码。
- 不改变 TX 字节，也不连接真实物理设备。

## Acceptance

1. 默认 raw 模式保留读取块展示行为。
2. delimiter 模式将 `A\nB\n` 拆为两条 RX 帧，并在 `C` 后续收到 `\n` 时产生第三帧。
3. 缓冲区有最大容量；无分隔符的数据不会无限占用内存。
4. UI 打开串口时会发送明确的 framing 配置。

## Risk tier

`L2` — 改变接收事件的帧语义及 Renderer/后端串口配置契约。真实设备写入与验证不在本 change 范围内。
