# Tasks: add-mcp-server

## L3 阶段与人工闸门

| 阶段 | 人工闸门 | 状态 |
| --- | --- | --- |
| G1 proposal/安全边界确认 | 用户确认传输、工具清单、授权模型、真实设备边界 | 进行中 |
| G2 design/specification 评审 | 独立评审通过 | 待 G1 |
| 实现（Mode P） | — | 待 G2 |
| 验证（模拟/受限端口） | — | 实现后 |
| G3 独立审核 + 真实设备授权 | approved + 用户授权 | 待实现后 |

## 场景—验证映射（草案，G1 后细化）

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| MCP 客户端握手 | MCP stdio 集成测试 | 以 MCP 协议连 server | 握手失败 |
| list_ports 只读 | 同上 | 调用 | 不返回端口 |
| 未授权写被拒 | 同上 | send_data 未授权 | 未拒绝 |
| 端口白名单外被拒 | 同上 | 操作白名单外端口 | 放行 |
| 真实设备 | hardware | — | 未授权前 not-run |

## Explicit not-run / blocked

- 真实物理串口写操作：`not-run`，需用户授权 + 设备参数 + 无副作用探测。
- 真实 MCP 客户端（Claude Desktop/Cursor）端到端：取决于 G1 传输选型。
