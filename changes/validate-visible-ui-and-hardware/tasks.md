# Tasks: validate-visible-ui-and-hardware

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| Renderer 本地 IPC | CSP / source review | 检查 CSP 无 `ws://`，Renderer 仅经 Preload 调用 | 遗留网络连接许可或直连 socket |
| 可见窗口 | Electron visible smoke | 启动实际窗口、截图与视觉检查 | 无窗口、白屏、后端未连接 |
| UI 虚拟收发 | visible COM10/COM11 interaction | 刷新、打开 COM10、发送/接收/关闭 | 日志或状态未更新 |
| 真实硬件 | authorized physical serial integration | 记录设备、参数和探测授权后收发 | 未授权、端口不存在、报文副作用未知 |
| 授权 Modbus 模拟下位机 | COM10↔COM11 Modbus Slave | `node scripts/authorized-modbus-register-flow.js --authorized-com10-to-com11-modbus-slave --confirm-write-register-1-101` | 03 读值非 100、CRC/异常/超时均阻止 06；06 回显失败报告未确认并关闭。 |
| 授权 Modbus 关联边界 | 无写入单元测试 | `node scripts/test-authorized-modbus-register-flow.js` | 遗留 RX 或 CRC 错误帧被误关联至本次请求。 |
| 过程 | process check | `npm run process:check` | 变更包证据无效 |

## Checklist

- [x] 记录 RED：现有证据未证明可见 UI 或真实硬件
- [x] 实施 CSP / 文档前置修复
- [x] 执行并记录可见 UI 验收
- [x] 执行或明确阻塞真实硬件验收
- [x] 写入 evidence.md
- [x] 执行用户授权的 Modbus Slave 条件读写（COM10→COM11；寄存器 0=100 后写寄存器 1=101）
- [x] L3 独立只读审核（conditionally-approved；P1=0、P2=2；保持 implementing，不得归档）

## Explicit not-run / blocked

- 真实物理串口发送：`not-run`。本轮 COM11 为用户声明的 Modbus Slave 模拟下位机，不应记录为真实物理设备。
