# Specification: add-modbus-checksum-and-excel

## Requirement: 命令生成包含校验码

`generateCommandsWithDeepSeek` 返回的每条 Modbus 命令 MUST 在字节末尾包含计算后的 CRC16-Modbus 校验码（低字节在前）。

### Scenario: Modbus 命令带校验码
- GIVEN 规约指明使用 Modbus CRC16
- WHEN 生成命令（checksum=modbus-crc16）
- THEN 返回命令的 code = [地址, 功能码, 数据..., crc低, crc高]
- AND crc 由本地计算，与标准 CRC16-Modbus 一致

### Scenario: 非 Modbus 命令不追加
- GIVEN 规约为自定义协议（无校验标记）
- WHEN 生成命令
- THEN code 保持模型原样，不追加校验码

### Scenario: 启发式兜底
- GIVEN 命令前两字节为合法 Modbus 从站地址 + 标准功能码，但模型未标 checksum
- WHEN 生成命令
- THEN 按 modbus-crc16 追加校验码

## Requirement: 支持 Excel 点表导入

`extractProtocolText` MUST 支持 `.xlsx`/`.xls` 文件，解析为带表头的制表符表格文本，纳入现有导入流程（返回 `{ ok, text }`）。

### Scenario: 导入 xlsx 点表
- GIVEN 用户选择 Modbus 点表 `.xlsx`
- WHEN 导入
- THEN 返回包含各 sheet 名称与表格内容的文本（列：从站地址/modbus地址/功能码/描述 等）

### Scenario: 导入 xls 点表
- GIVEN 用户选择 `.xls` 文件
- WHEN 导入
- THEN 同样解析成功

### Scenario: 文件过滤器
- GIVEN 打开导入对话框
- THEN 可选 xlsx/xls 文件

## Requirement: 兼容性
既有 docx/pdf/txt/md 导入行为 MUST 不变；`file:importProtocol` 返回结构不变。
