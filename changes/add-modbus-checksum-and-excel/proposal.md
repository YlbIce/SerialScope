# Proposal: add-modbus-checksum-and-excel

## Why

1. 用户反馈：命令生成时没有给出计算后的校验码。Modbus 规约/点表通常明确使用 CRC16-Modbus，生成的读写命令应包含计算好的校验码，否则发送到设备会被判为非法帧。
2. 用户反馈：Modbus 点表 Excel 文档（`.xlsx`，含"从站地址 / modbus地址 / 功能码 / 描述"等列）当前不支持导入。需要支持这类 Excel 点表，提取为规约文本供 AI 解析。

## Why L2

- 校验码计算（CRC16-Modbus）是**本地确定性计算**，不新增网络边界。
- Excel 点表解析是**本地文件解析**（新增 xlsx 依赖，纯本地）。
- 不改变 `file:importProtocol` 的对外返回结构（仍返回 `{ ok, text, canceled, message }`）。
- 不改变 DeepSeek 调用/上传边界（仍是用户显式触发命令生成）。
- 命令仍由用户手动触发、手动发送，不自动写入真实设备。

故按 AGENTS.md 归为 L2（可观察行为 + 新增本地文件格式支持），采用 Mode S（实施者写入、审核者只读）。若后续要求"生成后自动发送到真实设备"，须升级 L3。

## What

- `deepseek-provider.js`：
  - 修改 `COMMAND_SYSTEM_PROMPT`，明确指示模型对 Modbus 命令返回校验方式并生成"主体字节 + 校验码"；命令结构增加可选 `checksum` 字段（如 `modbus-crc16`）。
  - 新增 `ensureCommandChecksum(commands)`：对标记为 Modbus 或明显是 Modbus 帧的命令，用本地 Node 实现的 CRC16-Modbus 重新计算并追加校验码（低字节在前），覆盖模型可能算错的 CRC，确保命令正确。
- `protocol-import.js`：新增 Excel 点表解析（`.xlsx`/`.xls`），把每个 sheet 解析为制表符分隔的表格文本，供 AI 分析；纳入 `extractProtocolText`。
- `main.js`：`file:importProtocol` 文件过滤器增加 xlsx/xls。
- `package.json`：新增 xlsx 解析依赖。

## Non-goals

- 不自动把生成命令发送到真实设备（保持手动触发）。
- 不改变既有 docx/pdf/txt/md 导入行为。
- 不实现通用任意 Excel 任意语义解析——聚焦 Modbus 点表常见列（从站地址/modbus地址/功能码/描述/单位/小数位）。
- 不新增校验方式选择 UI（由规约文本/模型判断；本地仅对 modbus-crc16 追加）。

## Risk tier

`L2` — 本地校验码计算 + 本地 Excel 解析 + 提示词调整，不改变网络/设备安全边界。Mode S，场景映射先行，完成实现后进入 ready-for-review。
