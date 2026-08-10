# Tasks: integrate-workbench-macros-and-checksums

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 标准 CRC 计算与非法输入 | workbench checksum unit | `npm run test:workbench-checksums` | 校验值、字节序或拒绝边界错误。 |
| 选择主界面既有宏 | React 工作台可见 UI | `npm run test:react-workbench-ui` | 宏选择器不显示主宏或节点引用未持久化。 |
| 主界面宏计算并发送 | Electron UI + 虚拟串口 | `npm run test:electron-ui` | 计算结果未写回宏或发送内容错误。 |
| 语法与变更包 | 静态/过程检查 | `npm run check`、`npm run process:check` | JS 语法或证据结构错误。 |

## Checklist

- [x] 记录 RED：工作台仅加载自身宏存储，主宏编辑器仅有 Modbus 发送时追加。
- [x] 实施范围内改动
- [x] 运行映射验证（主界面虚拟串口回归已通过）
- [x] 写入 evidence.md
- [ ] L2/L3 发起独立审核

## Explicit not-run / blocked

- 真实物理串口验证：未获设备、连接参数与安全报文授权；本 change 的定向验证使用纯计算和现有虚拟串口自动化。
