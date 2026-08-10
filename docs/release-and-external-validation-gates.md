# SerialScope 发布、合规与外部验证闸门

本文是生产发布前的受控清单，不是发布授权，也不代替法务、设备负责人或安全负责人的签字。

## 9.5 Windows 安装包、签名与更新

当前仓库没有可复现的 `electron-builder` 依赖锁定、NSIS 制品、代码签名证书或更新源。发布负责人必须先提供以下输入：

- [ ] 已批准的应用标识、公司名称和版本策略。
- [ ] Authenticode 证书的受控签名通道（不得将 PFX、口令或云签名 Token 写入仓库、日志或 CI 输出）。
- [ ] 受控 HTTPS 更新源及发布权限；更新元数据、安装包和签名须同批次留档。
- [ ] Windows x64 干净虚拟机上的安装、升级、卸载、回退和 SmartScreen 验证记录。

实施完成后，NSIS 构建和更新检查必须在隔离测试通道验证；生产通道的发布、上传和启用自动更新均需要人工确认。Electron-builder 的 Windows 默认目标为 NSIS，配置可置于 `package.json` 的 `build` 字段；自动更新要求受控更新服务器与已验证的发布制品。[electron-builder 配置](https://www.electron.build/docs/configuration/) · [NSIS 目标](https://www.electron.build/nsis/)

## 9.6 跨 Windows 会话拒绝

Named Pipe 单元逻辑仅证明服务器检查了客户端进程 Session ID；发布前必须在两套真实 Windows 登录会话中执行：

1. 会话 A 启动 SerialScope 后端并记录 PID、Pipe 名称、A 的 Session ID。
2. 会话 B（同 SID 的第二登录会话）以 `SERIALSCOPE_CROSS_SESSION_PIPE=<Pipe 名称> node scripts/test-cross-session-pipe-client.js` 尝试连接；预期在 `backend.ready` 和任何 RPC 前断开。
3. 会话 B（不同 SID）重复连接；预期由 DACL 拒绝。
4. 会话 A 仍能连接、`backend.ping` 与非破坏性 `serial.status` 正常；日志记录拒绝事件而不泄露 Pipe token。

必须记录使用的账户/会话、操作授权、Windows 版本、命令输出和诊断 `runId`。没有真实双会话证据不得把 G3 标为完成。

## 9.7 CSerialPort LGPL 审查

仓库内的 `backend/vendor/CSerialPort/LICENSE` 是 LGPL-3.0-only WITH LGPL-3.0-linking-exception 文本。发布前需要法务确认：

- [ ] 分发包包含第三方通知及未修改的 CSerialPort 许可证副本。
- [ ] 交付物的链接方式、修改情况、可重链接义务和源代码提供义务由法务书面确认。
- [ ] 许可证清单覆盖 Electron、Boost、nlohmann/json、CSerialPort 及所有新增生产依赖。
- [ ] 法务审查工单编号、审查人、日期和结论已归档。

该检查不构成法律意见；未取得书面结论时不得对外发布。

## 9.8 真实物理设备回归（L3）

虚拟 COM10/COM11 成功不等同于真实 Modbus Slave 或 PLC 成功。执行前，设备负责人必须一次性填写并二次确认：

- [ ] 设备型号、资产编号、固件版本、物理端口及拓扑。
- [ ] 波特率、数据位、校验、停止位、流控、站号、寄存器/命令白名单和预计副作用。
- [ ] 首次执行仅限非破坏性读取；任何写入另列报文、前置读值、回显/CRC 判定和可回退措施。
- [ ] 现场窗口、操作者、监护人及紧急停止方案。

测试记录必须包含授权文本、两次确认时间、完整步骤、观察范围和失败边界。无授权时仅可运行虚拟串口、纯函数或模拟器测试。
