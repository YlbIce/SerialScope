# Specification: harden-protocol-observability-and-recovery

## Requirement: correlated persisted diagnostics

Main、Renderer 和 C++ 后端 MUST 为一次桌面运行写入可解析 JSONL 诊断事件，且每项都包含相同 `runId`、时间、来源和事件名。日志 MUST 不包含 API Key；RX/TX 默认仅记录方向、字节数和序号。超过保留上限时 MUST 轮转，且旧文件数量有界。

### Scenario: backend exit can be reconstructed

- GIVEN 后端正在运行且 Renderer 已发出 RPC
- WHEN 后端异常退出或 Named Pipe 断开
- THEN 日志包含 Main 子进程退出、RPC/断开和 Renderer 观察到的事件，并使用同一 `runId`。

## Requirement: opt-in serial auto reconnect

系统 MUST 仅在用户启用自动重连后重试失败的 `serial.open`；延迟 MUST 指数增长且有上限和最大尝试次数。用户手动关闭串口或关闭该开关 MUST 立即取消未执行的重试。

### Scenario: retry is bounded and cancellable

- GIVEN 用户已启用自动重连并提交一个失败的串口打开请求
- WHEN 打开连续失败
- THEN 系统最多执行八次重试，间隔不超过八秒；用户手动关闭后不再调用 `serial.open`。

## Requirement: protocol lifecycle and load coverage

虚拟串口自动化 MUST 覆盖 `serial.open`、双向 `serial.send`/`serial.rx`/`serial.tx`、`serial.close`、reopen、非法载荷拒绝和统计更新。压测 MUST 覆盖 128 KiB 固定帧及短帧洪峰，并明确其不证明真实硬件吞吐。

## Non-requirements

不声明真实设备、跨 Windows 会话、发布签名或法务审查已完成。
