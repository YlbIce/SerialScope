# Tasks: add-modbus-checksum-and-excel

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| Modbus 命令 code 追加 CRC16 | 单元验证 ensureCommandChecksum | 构造 checksum=modbus-crc16 命令 | code 末尾无 CRC 或 CRC 错误 |
| CRC16-Modbus 标准向量 | 单元验证 | 对已知向量计算 | 结果与标准不符 |
| 非 Modbus 不追加 | 单元验证 ensureCommandChecksum | 无 checksum 且非 Modbus 帧 | 被误追加 |
| 启发式兜底 | 单元验证 ensureCommandChecksum | 前两字节=从站+功能码 | 未追加 |
| Excel 点表解析 | 集成验证 extractExcelText | 对示例 xlsx 解析 | 无表头/内容缺失 |
| 文件过滤器含 xlsx/xls | 代码审查 main.js | 检查 dialog filters | 无 xlsx 项 |
| 既有导入不回归 | 回归测试 | test:protocol-import | 回归失败 |

## Checklist

- [x] 创建 change 包文档
- [x] deepseek-provider.js：修改 COMMAND_SYSTEM_PROMPT + ensureCommandChecksum
- [x] package.json：新增 xlsx 依赖
- [x] protocol-import.js：extractExcelText
- [x] main.js：文件过滤器加 xlsx/xls
- [x] 验证（ensureCommandChecksum / extractExcelText / 回归）
- [ ] 独立只读审核；不自动归档

## Explicit not-run / blocked

- 真实 Modbus 设备端到端（校验码被设备接受）需用户授权 + 连接设备；本变更验证的是本地 CRC 计算正确性。
- 用户提供的具体点表 `.xlsx` 文件解析依赖该文件；通用 xlsx 解析用示例验证。
