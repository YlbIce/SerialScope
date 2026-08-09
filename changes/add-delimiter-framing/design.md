# Design: add-delimiter-framing

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 解码位置 | `SerialSession` 收到字节后、发出 `serial:rx` 前 | 所有规则、日志与曲线共享同一可信帧边界 |
| 默认 | `raw` | 兼容当前行为，避免现有 profile 无提示改变 |
| delimiter | LF / CRLF / CR / `HEX:<bytes>` | 覆盖文本协议与常见二进制结束符，无需新增依赖 |
| 缓冲上限 | 1 MiB，溢出时清空并发 serial:error | 防止无结束符流无限增长，错误对用户可见 |
| UI | 连接面板选择模式和分隔符；raw 时禁用分隔符 | 将协议假设显式化 |

## Risks

- 默认 raw 保持读取块语义；用户必须主动选择 delimiter。
- delimiter 会包含在帧内，便于日志保留原始字节；后续协议层可选择剥离。
- 大于 1 MiB 且没有 delimiter 的数据被丢弃并报错；这是受控退化，不是静默内存增长。
