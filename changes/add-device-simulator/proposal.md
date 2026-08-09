# Proposal: add-device-simulator

## Why

调试时需要第二个应用实例在虚拟串口另一端模拟下位机，而不必每次准备真实硬件。

## What

- 新增模拟下位机页面和独立窗口。
- RX 帧可触发 Echo、AT 或 Modbus RTU 内置应答，也可匹配自定义 HEX 帧并发送自定义 HEX 回复。
- 回复模板支持随机数据占位符：`{{RAND8}}`、`{{RAND16LE}}`、`{{RAND16BE}}`、`{{RANDHEX:n}}`。

## Non-goals

- 不在未启用时自动写串口；不覆盖真实设备安全授权。
- 不以此替代真实硬件或跨会话 ACL 验收。
