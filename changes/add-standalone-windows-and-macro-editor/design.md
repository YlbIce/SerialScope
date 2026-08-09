# Design: add-standalone-windows-and-macro-editor

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 后端连接 | 仅 Main 持有一个 Named Pipe RPC client | 保持单客户端 Pipe 安全约束。 |
| 窗口同步 | Main 广播 notification；窗口启动时读取 `serial.status` | 避免各 Renderer 对同一串口产生独立、陈旧状态。 |
| 宏持久化 | `localStorage` + profile JSON | 与现有规则和 profile 的本地保存模型一致。 |
| 宏执行 | 复用 `serial.send` | 不增加新的串口写入契约。 |

## Risks and mitigations

| 风险 | 缓解 |
| --- | --- |
| 多窗口错误地直接访问 Pipe | Preload 仅公开 Main IPC；Main 统一转发。 |
| 宏包含无效 HEX 或空文本 | 编辑时校验，执行失败显示后端错误。 |
| 辅助窗口重复创建 | 按模块复用已有窗口并聚焦。 |
