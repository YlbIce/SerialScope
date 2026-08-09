# Specification: migrate-named-pipe-json-rpc

## Requirement: 本地 Named Pipe RPC

后端 MUST 创建仅限当前用户访问、带随机后缀的 Windows Named Pipe；MUST NOT 监听 TCP 或 WebSocket。每个传输消息 MUST 使用 4 字节小端 UTF-8 字节长度前缀，且编码长度 MUST 不超过 4 MiB。

### Scenario: 连接与调用

- GIVEN Electron 已启动其本地后端
- WHEN Main 进程用启动时得到的管道名连接并调用 `ports.list`
- THEN 后端以 JSON-RPC 2.0 响应端口数组，Renderer 不持有网络 socket。

### Scenario: 非法或超长消息

- GIVEN 管道客户端发送格式错误 JSON、未知方法或长度超过 4 MiB 的帧
- WHEN 后端解析该帧
- THEN 返回 JSON-RPC 错误或断开该客户端；后端继续接受新客户端，且不得静默丢弃。

## Requirement: 串口契约迁移

`ports.list`、`serial.open`、`serial.close` 和 `serial.send` MUST 等价映射为 JSON-RPC 方法。`serial.state`、`serial.rx`、`serial.tx` 与 `serial.error` MUST 作为 JSON-RPC notification 发送。

### Scenario: 虚拟串口收发

- GIVEN COM10 与 COM11 构成虚拟串口对，且 COM10 已通过 `serial.open` 打开
- WHEN COM11 写入数据、Renderer 经 RPC 调用 `serial.send`
- THEN Renderer 收到 `serial.rx` notification，COM11 收到对应发送数据。

## Requirement: 定长最大帧重新验收

`fixed` 配置 MUST 只接受严格整数帧长；最大允许值 MUST 在 Named Pipe 4 MiB 边界内完整交付给 Renderer，或被 `serial.open` 的显式错误拒绝。不得产生无通知的实时数据丢失。

### Scenario: 最大帧

- GIVEN COM10 以最大允许 fixed 配置打开
- WHEN COM11 写入恰好一帧数据
- THEN Renderer 收到一条包含完整字节数的 `serial.rx` notification，或打开请求在写入前返回明确错误。

## Non-requirements

本 change 不实现模拟下位机规则、宏录制或子窗口交互；但 RPC 桥必须可供后续模块复用。
