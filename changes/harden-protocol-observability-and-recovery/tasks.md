# Tasks: harden-protocol-observability-and-recovery

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 跨进程诊断日志 | diagnostics unit/integration | `npm run test:diagnostics` | 缺 runId、敏感字段泄漏或轮转无界。 |
| 自动重连退避/取消 | reconnect policy unit | `npm run test:serial-reconnect` | 退避无上限、重试不取消或默认启用。 |
| 协议生命周期 | virtual COM RPC | `npm run test:named-pipe-protocol-lifecycle` | open/close/reopen、状态、收发或错误边界缺失。 |
| 大流量与长帧 | virtual COM stress | `npm run test:named-pipe-load` | 128 KiB 或短帧洪峰超时/统计不一致。 |
| 语法/变更包 | static/process | `npm run check`、`npm run process:check` | 语法或证据结构错误。 |

## Checklist

- [x] 审计现有协议测试、前端后端重连和日志路径
- [x] 实施诊断、重连和测试改动
- [x] 运行映射验证（虚拟 COM 生命周期、921600 bps 短帧洪峰、128 KiB 固定帧和可见 Electron UI）
- [x] 写入 evidence.md
- [ ] L2 发起独立只读审核

## Explicit not-run / blocked

- 跨 Windows 会话拒绝：需第二个 Windows 会话与独立登录身份。
- 真实物理设备回归：需用户明确授权设备、连接参数和报文。
