# Specification: add-delimiter-framing

## Requirement: 接收帧模式

`serial:open` MUST 接受 `framing` 对象。省略或 `mode=raw` 时，每次读取块产生一个 RX 事件。`mode=delimiter` 时，后端 MUST 跨读取块累积字节，并在每个完整分隔符出现时产生一条包含分隔符的 RX 事件。

### Scenario: 粘连文本帧

- GIVEN 串口以 delimiter/LF 模式打开
- WHEN 收到字节 `A\nB\n`
- THEN 产生两个 RX 帧 `A\n` 与 `B\n`

### Scenario: 拆分文本帧

- GIVEN 串口以 delimiter/LF 模式打开
- WHEN 首先收到 `C`，随后收到 `\n`
- THEN 首次读取不产生 RX 帧
- AND 后续读取产生一个 RX 帧 `C\n`

## Requirement: 有界缓冲

delimiter 缓冲 MUST 不超过 1 MiB。达到上限且仍未找到完整分隔符时，后端 MUST 丢弃该缓冲并发出 `serial:error`，之后可以继续接收后续帧。

## Requirement: 配置验证

delimiter 模式 MUST 拒绝空分隔符和无效 HEX 分隔符，并将错误返回到 `serial:open:result`。
