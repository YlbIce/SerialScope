# Design: harden-protocol-observability-and-recovery

## Decisions

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 日志格式 | 每行独立 JSON（JSONL），字段含 `timestamp`、`runId`、`source`、`event`、安全的结构化详情 | 崩溃后可增量读取、机器分析且不依赖正常退出。 |
| 日志保留 | 5 MiB 单文件、最多 5 个轮转文件 | 给现场诊断足够窗口，同时限制用户目录占用。 |
| 跨进程关联 | Main 创建 `runId`，作为后端 `--diagnostics-run-id` 参数；Renderer 经受限 IPC 带同一 ID 记录故障 | 不记录 API Key 或串口完整 payload，仍能还原生命周期。 |
| 自动重连 | 默认关闭、前端持久化开关；600 ms 起始、上限 8 s、最多 8 次；仅重试用户成功提交的串口配置 | 避免无意持续占用真实设备或无限重试。 |
| 大流量压测 | 虚拟 COM 对端分批发送，涵盖 128 KiB 固定帧和短帧洪峰，使用明确超时和统计断言 | 可重复测出读取/FrameDecoder/Named Pipe 链路的边界，不能替代真实硬件吞吐。 |

## Risks and mitigations

| 风险 | 缓解或验证方式 |
| --- | --- |
| 日志写入拖慢数据面 | 仅记录元数据/长度/结果，不写 RX/TX 全 payload；异步/追加写入和固定上限。 |
| 自动重连干扰用户 | 默认关闭，手动关闭、配置变更和达到次数上限均取消。 |
| 端口已被其他进程占用 | 测试显式报告 `blocked`，不把环境占用伪装为产品失败。 |

## Out of scope

证书私钥、更新服务器密钥、真实跨会话测试账户和真实 PLC/Modbus Slave 授权。
