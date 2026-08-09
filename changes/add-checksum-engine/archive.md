# Archive: add-checksum-engine

## Review decision

- Mode S review round: `1`
- Result: `conditionally-approved`
- P1: `0`
- P2: `2`

保留的 P2：
1. `fromName` 未知名静默返回 NONE，接入 JSON-RPC 时非法算法名会被当无校验，建议后续提供错误信号。
2. CRC 参数固定默认（refin/refout/init/xorout），非标协议需后续可配置化。

## Human archive gate

- Approved by: user
- Approval text: `选择归档已完成的 L2 变更包`
- Archive status: `archived`
- Note: 本次归档确认 ChecksumEngine 多算法校验库实现与单元测试，不确认真实物理串口行为或 IPC 契约变化（本变更不改 IPC）。
