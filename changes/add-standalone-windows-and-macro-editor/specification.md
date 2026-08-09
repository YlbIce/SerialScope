# Specification: add-standalone-windows-and-macro-editor

## Requirement: 独立模块窗口

每个主功能模块 MUST 能通过 Main IPC 打开独立 BrowserWindow；所有窗口 MUST 经 Main 接收同一后端 notification，Renderer MUST NOT 直接连接 Pipe。

### Scenario: 独立宏窗口

- GIVEN 主窗口已连接后端
- WHEN 用户打开宏模块的独立窗口
- THEN 窗口显示宏编辑器，并能接收串口状态更新。

## Requirement: 宏编辑与执行

宏 MUST 支持名称、Text/HEX 内容、行尾和 Modbus CRC 选项的新增、编辑、删除与本地保存；执行 MUST 使用现有 `serial.send`。

### Scenario: 保存并执行宏

- GIVEN 串口已打开且用户保存一条 HEX 宏
- WHEN 用户点击该宏执行
- THEN 调用 `serial.send`，并在收发日志显示发送结果。
