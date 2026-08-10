# Evidence: add-modbus-checksum-and-excel

```json
{
  "change": "add-modbus-checksum-and-excel",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "阅读 src/main/deepseek-provider.js、src/main/protocol-import.js、src/main/main.js、src/renderer/renderer.js",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认 COMMAND_SYSTEM_PROMPT 无校验码要求、协议导入无 Excel 支持、renderer 已有 crc16Modbus/appendModbusCrcToHex、saveGeneratedCommandsToMacros 保存命令 appendModbusCrc=false",
      "doesNotProve": "真实 Modbus 设备接受度"
    },
    {
      "command": "node -e 计算 Modbus CRC16 已知向量 01 03 00 00 00 0A -> 0xCDC5、01 06 00 01 00 64 -> 0xE1D9",
      "kind": "root-cause-analysis",
      "status": "passed",
      "purpose": "确认 CRC16-Modbus 算法与公认标准向量一致",
      "doesNotProve": "模型生成主体字节的正确性"
    }
  ],
  "verification": [
    {
      "command": "node scripts/verify-modbus-checksum-excel.js",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证 ensureCommandChecksum 对 checksum=modbus-crc16 命令追加 CRC（低字节在前）、checksum=none 不追加、无标记非 Modbus 帧不追加、启发式兜底（从站+功能码）、不修改入参对象；extractExcelText 解析用户提供的实际点表 xlsx（72466 字符，含 4 个 sheet 名与从站地址/modbus地址/功能码列头）",
      "doesNotProve": "真实 Modbus 设备接受校验码"
    },
    {
      "command": "npm run test:ai-rpc / npm run test:protocol-import",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "确认 AI RPC 与既有 docx/pdf/txt/md 导入无回归",
      "doesNotProve": "DeepSeek 真实命令生成"
    },
    {
      "command": "npm run check / npm run process:check",
      "kind": "syntax-check / process-contract",
      "status": "passed",
      "purpose": "验证 JS 语法（含 deepseek-provider.js / protocol-import.js / main.js）与 change 包结构（24 个活动 change）",
      "doesNotProve": "运行期行为"
    }
  ],
  "residualRisk": [
    "命令主体字节由 DeepSeek 模型生成，本地仅负责校验码计算；模型生成的主体字节正确性依赖提示词质量",
    "启发式兜底可能把非 Modbus 但功能码巧合的帧误判为 Modbus 追加 CRC（对标准功能码 01/02/03/04/05/06/0F/10 限定，误判概率低）",
    "真实 Modbus 设备端到端未验证（需用户授权 + 连接设备）",
    "Excel 点表解析聚焦常见列结构，非常规格式可能解析不理想"
  ],
  "handoff": {
    "state": "ready-for-review",
    "request": "独立只读审核：核对 COMMAND_SYSTEM_PROMPT 修改、ensureCommandChecksum CRC 计算与追加顺序、extractExcelText 解析、main.js 过滤器、xlsx 依赖"
  }
}
```
