# Tasks: serialize-auto-query-timing

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| RED：旧逻辑可并发发送 | 代码审阅与原 CSV | `setInterval(sendCurrentInput)` | 高速 TX 超过 RX、在途数累积。 |
| 10 ms 单在途与超时 | 生产 Electron 前端自动化 | `npm run test:auto-query-backpressure-ui` | 在途数超过 1，或无应答时不能结束本轮并进入下一轮。 |
| 10 ms 请求—应答收敛 | 生产 Electron + COM10/COM11 | `npm run test:auto-query-timing` | 未完成至少 20 个往返，或停止并静默后 TX/RX/对端应答数不相等，或在途数超过 1。 |
| 全量现有生产流程 | 生产回归 | `npm run test:production-simulator` | 模块、模拟器或串口交互回归。 |
| CSV 时序字段 | 静态日志导出契约 | `npm run test:log-export-contract` | TX/RX/SYS 缺少毫秒时间或单调序号，或 CSV 缺少字段。 |

## Checklist

- [x] 记录 RED：用户 CSV 中高频段最大积压 64，源代码使用无等待 `setInterval`。
- [x] 实施范围内改动
- [x] 运行映射验证（请求—应答收敛受 COM10 外部占用阻断）
- [x] 写入 evidence.md
- [x] L3 独立只读复审：conditionally-approved（P1=0，P2=1）；窗口缩放回归失败保留为独立 follow-up

## Explicit failed / blocked

- `npm run test:production-simulator`：failed；独立串口配置窗口的脚本化 `window.resizeTo(700, 820)` 未改变其 620×760 默认尺寸。该失败与自动查询时序无关，另由窗口缩放 change 跟进。
- 真实硬件串口验证：blocked；未获本 change 的设备、连接参数和安全报文授权。
