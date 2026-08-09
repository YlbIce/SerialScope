# Specification: add-device-simulator

## Requirement: 受控模拟回复

模拟下位机 MUST 默认关闭；启用后仅因 `serial.rx` 触发，且 MUST 使用现有 `serial.send` 发送回复。

### Scenario: 自定义规则

- GIVEN 模拟实例在 COM11 打开且已配置 `41 42 -> CA FE`
- WHEN COM10 发出 `41 42`
- THEN COM10 在同一连接上收到 `CA FE`。

## Requirement: 内置规约与随机模板

系统 MUST 支持 Echo、AT、Modbus RTU 03/04/06/16 以及声明的随机 HEX 占位符。

### Scenario: AT

- GIVEN AT 内置规约已启用
- WHEN 对端发送 `AT`
- THEN 模拟实例回复 `OK\r\n`。

## Requirement: 多窗口唯一执行者

当独立模拟窗口打开时，主窗口 MUST 停止自动回复；关闭后主窗口 MAY 恢复执行权。
