# Archive: add-length-field-framing

## Review decision

- Mode S review round: `1`
- Result: `conditionally-approved`
- P1: `0`
- P2: `2`

保留的 P2：
1. 未校验 `lengthFieldOffset` 语义范围（若 offset < header.size()，长度值可能读到非预期字节），建议后续 spec 补充约束或配置时防御。
2. 测试未覆盖 minFrameSize 强制校验及 lengthFieldOffset 非默认组合；payload 内伪 header 误分帧由后续规则层处理。

## Human archive gate

- Approved by: user
- Approval text: `选择归档已完成的 L2 变更包`
- Archive status: `archived`
- Note: 本次归档确认 FrameDecoder 的 Length（帧头+长度域）分帧模式实现与单元测试，不确认真实物理串口行为或 IPC 契约变化（本变更不改 IPC）。
