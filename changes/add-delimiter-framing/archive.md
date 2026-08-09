# Archive: add-delimiter-framing

## Review decision

- Mode S review rounds: `3`
- Result: `approved`
- P1: `0`
- P2: `0`

审核确认固定 1 MiB 解码存储不会因 4 KiB 读取块出现超额峰值；delimiter 粘连/拆分、raw 兼容、无效 HEX 和自定义 HEX 输入均与规格一致。

## Human archive gate

- Approved by: user
- Approval text: `确认归档`
- Archive status: `archived`

## Known limits retained

- Renderer GUI smoke、CSerialPort 回调时序和真实物理串口验证未执行。
- 定长、空闲超时、长度字段与协议插件不在本 change 范围内。
