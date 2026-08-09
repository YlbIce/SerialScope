# Design: migrate-named-pipe-json-rpc

## Decisions

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| RPC 实现 | 优先 `json-rpc-cxx` 0.3.2（vcpkg，MIT）；若依赖下载继续受阻，仅以已安装的 `nlohmann_json` 实现最小严格 JSON-RPC 2.0 dispatcher，并保持可替换接口 | `json-rpc-cxx` 安装被本机代理 TLS 阻断，未通过 PoC 前不得宣称采用。 |
| 传输 | `\\\\.\\pipe\\SerialScope.Native.<随机 UUID>`，4 字节小端长度 + UTF-8 JSON | 不暴露 TCP 端口；名称不可预测；明确处理字节流粘连和拆分。 |
| 管道访问 | 受保护 DACL：仅 Owner SID 全控制；`PIPE_REJECT_REMOTE_CLIENTS`；创建 ACL 失败即退出 | 防止其他 Windows 用户和远程客户端连接；同一用户本地进程为明确的可信边界。 |
| 连接策略 | Electron Main 生成管道名；后端只接受一个客户端；`backend.ready` 启动通知在 5 秒内到达，否则 Main 终止后端并报告失败 | 避免竞争客户端、名称碰撞和启动顺序不确定。 |
| Electron 边界 | Main 进程是唯一管道客户端；Preload 仅公开 `rpc.call`、通知订阅与文件对话框 | Renderer 无 Node/网络权限，独立窗口复用同一可信桥。 |
| 事件 | JSON-RPC notification：`serial.state`、`serial.rx`、`serial.tx`、`backend.status` | 事件不伪装为响应；多窗口可订阅同一后端。 |
| 负载边界 | 不含 4 字节前缀的单请求、批处理整体、响应和通知 UTF-8 编码后最大 4 MiB；读取前拒绝长度；超限帧立即断开（不能安全回写错误时），应用内超限响应返回 `-32001` | 不分配超限缓冲，不静默丢弃，并使最大 fixed 帧可验收。 |

## RPC surface (phase 1–2)

| JSON-RPC 方法/通知 | 方向 | 参数/结果 |
| --- | --- | --- |
| `ports.list` | Renderer → Backend | `[]` / 端口数组 |
| `serial.open` | Renderer → Backend | 现有串口配置 / `{ok,message,state}` |
| `serial.close` | Renderer → Backend | `{}` / `{ok,message,state}` |
| `serial.send` | Renderer → Backend | 现有发送 payload / `{ok,bytes,state}` |
| `backend.shutdown` | Renderer → Backend | `{}` / `{ok}` |
| `serial.state`、`serial.rx`、`serial.tx`、`serial.error` | Backend → Renderer | 原有 payload，改为 notification |

## Risks and mitigations

| 风险 | 缓解或验证方式 |
| --- | --- |
| 管道 ACL 配置错误 | 单元/集成检查 DACL 与不同用户访问拒绝；启动失败不降级为开放 TCP。 |
| JSON 边界粘连、拆分或超长 | 对长度前缀编解码建立原生测试；4 MiB + 1 字节负向测试。 |
| 后端重启导致请求悬挂 | Main 进程使所有 pending request 在断开时失败，并采用有界退避重连。 |
| 多窗口重复连接/事件 | Main 进程单连接、向每个 webContents 广播；窗口销毁时移除订阅。 |
| 最大 fixed 帧未达 | 迁移后经 COM10/COM11 做端到端测试；超限必须显式 RPC 错误。 |
| 同一用户恶意进程 | 明确不在本地 IPC 威胁模型内；若产品要求抵抗该攻击者，需要单独 L3 设计进程令牌保护。 |

## Out of scope

模拟下位机、宏、独立窗口具体 UI 在此管道契约稳定并经 L3 人工闸门后进入后续 change。
