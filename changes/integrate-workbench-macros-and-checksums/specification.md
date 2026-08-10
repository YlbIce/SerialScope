# Specification: integrate-workbench-macros-and-checksums

## Requirement: reuse existing macros in the workbench

通信测试工作台 MUST 将主界面 `serialscope.macros` 中格式有效的宏显示在 `macro` 节点的引用宏库选择器中。被选中的既有宏 MUST 提供稳定 `legacy-` ID、名称、模式、载荷、行尾和版本快照，且执行报告只记录实际执行的宏。

### Scenario: select an existing main macro

- GIVEN 主界面宏库包含 HEX 宏“既有读取宏”
- WHEN 用户在工作台宏节点的“引用宏库”选择该宏
- THEN 流程节点保存该宏的 `legacy-` ID 与报文元数据，并可在执行时发送及快照。

## Requirement: calculate common CRCs while editing a macro

宏编辑器 MUST 允许用户为合法 HEX 报文选择 CRC-8、CRC16-Modbus、CRC16-CCITT-FALSE、CRC16-XMODEM 或 CRC32（IEEE，小端），并通过明确操作把结果追加到编辑中的报文。

### Scenario: append a selected checksum

- GIVEN 宏编辑器中 CRC16-Modbus 主体为 `01 03 00 00 00 01`
- WHEN 用户选择 CRC16-Modbus 并点击“计算并追加校验”
- THEN 报文更新为 `01 03 00 00 00 01 84 0A`，且不再额外启用旧的发送时 Modbus CRC16 追加。

### Scenario: invalid HEX is rejected

- GIVEN 宏编辑器中的 HEX 为奇数长度或含非 HEX 字符
- WHEN 用户点击“计算并追加校验”
- THEN 编辑器保留原始报文并显示输入无效。

## Non-requirements

本 change 不保证任意厂商私有 CRC 参数，也不进行真实设备串口验证。
