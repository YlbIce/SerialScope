# Design: validate-visible-ui-and-hardware

## Decisions

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| UI 证据 | 运行实际 Electron 窗口并捕获可见状态 | 进程存活或 Node 语法检查不能证明用户界面。 |
| UI 流程 | 先使用用户给定 ELTIMA 虚拟对验收不具物理风险的收发交互 | 可检验端到端 UI，不替代真实硬件结论。 |
| 硬件发送 | 仅对已识别、参数明确、用户明确授权的设备发送预先记录的非控制性探测报文 | 防止意外改变设备状态。 |
| IPC CSP | Renderer 仅加载本地资源，不保留 `ws://` 连接许可 | 后端已迁移为 Named Pipe + Electron IPC。 |

## Risks and mitigations

| 风险 | 缓解或验证方式 |
| --- | --- |
| 设备未知或无可用真实端口 | 保持 `blocked`，请求设备标识与安全探测方案，不发送。 |
| 探测报文具有控制副作用 | 先记录设备厂商/型号、协议和用户授权，再执行；无此信息仅可打开与监听。 |
| UI 显示与后端状态脱节 | 同时观察窗口状态、通知日志和独立虚拟对字节证据。 |

## Out of scope

跨用户 Pipe ACL、慢客户端和 4 MiB 出站边界继续由 `migrate-named-pipe-json-rpc` 的未决 P2 跟踪。
