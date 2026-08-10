# Design: add-modbus-checksum-and-excel

## 1. 命令生成追加校验码

### 问题
`COMMAND_SYSTEM_PROMPT` 让模型生成 `{"name","code":[字节],"description"}`，code 不含校验码。Modbus RTU 帧 = 地址(1B) + 功能码(1B) + 数据(NB) + CRC16-Modbus(2B，低字节在前)。缺少 CRC 的帧无法被设备接受。

### 方案（本地计算为准，模型仅生成主体）
- 修改 `COMMAND_SYSTEM_PROMPT`：
  - 指示模型为每条命令返回 `{"name","code":[主体字节,不含校验码],"checksum":"modbus-crc16"|""|"none","description"}`。
  - 对 Modbus 命令，`code` 只含"从站地址+功能码+数据"，`checksum` 标 `modbus-crc16`。
- 新增 `ensureCommandChecksum(commands)`（Node 侧，`deepseek-provider.js`）：
  - 对 `checksum === 'modbus-crc16'` 的命令，用本地 CRC16-Modbus（多项式 0xA001）对 `code` 计算，追加 `[crc低, crc高]` 到 code 末尾。
  - 对无 checksum 标记但 code 长度 ≥2 且首个字节是合法从站地址、次字节是标准 Modbus 功能码（0x01/02/03/04/05/06/0F/10）的命令，也按 modbus-crc16 追加（启发式兜底）。
  - 其余命令不追加，保持原样。
- 在 `generateCommandsWithDeepSeek` 返回前调用 `ensureCommandChecksum`，保证所有 Modbus 命令带正确的 CRC。

### CRC16-Modbus 算法（与前端 renderer.js crc16Modbus / 后端 ChecksumEngine 一致）
```
crc=0xFFFF
for byte in bytes:
  crc ^= byte
  for bit in 0..7:
    crc = (crc&1) ? ((crc>>>1)^0xA001) : (crc>>>1)
```
追加顺序：低字节在前（Modbus 标准）。即 `[crc & 0xFF, (crc>>>8) & 0xFF]`。

## 2. Excel 点表解析

### 依赖
新增 `xlsx`（SheetJS 社区版）到 dependencies。它支持 `.xlsx`/`.xls` 且纯 JS，无原生依赖。

### `extractProtocolText` 扩展
- `.xlsx`/`.xls` → `extractExcelText(filePath)`：
  - 用 `xlsx.readFile` 读取工作簿。
  - 遍历每个 sheet，用 `xlsx.utils.sheet_to_json(sheet, { header:1, defval:'' })` 转二维数组。
  - 每行单元格用 `\t` 连接，空行跳过；sheet 之间用 `\n\n===== Sheet: <名称> =====\n` 分隔。
  - 输出带表头的规约表格文本，供 AI 解析。
- 返回 `{ ok: true, text }`。

## 3. 文件过滤器（main.js）
`file:importProtocol` 的 dialog filters 增加 `{ name: 'Excel 点表', extensions: ['xlsx','xls'] }`，并加入"规约文档"通用 filter。

## 4. 安全与兼容
- Excel 解析纯本地，不联网。
- 既有 docx/pdf/txt/md 行为不变。
- 命令校验码由本地计算保证正确，不依赖模型计算精度。
- 生成命令仍保存到宏库（`saveGeneratedCommandsToMacros`），由用户手动发送；不自动发送到设备。
