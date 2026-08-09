# Evidence: add-checksum-engine

```json
{
  "change": "add-checksum-engine",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 backend/src/ProtocolUtils.h",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认当前后端仅提供 crc16Modbus/appendModbusCrc，无多算法校验引擎",
      "doesNotProve": "ChecksumEngine 的目标行为"
    }
  ],
  "verification": [
    {
      "command": "backend/build/serialscope-checksum-engine-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证 CRC8/CRC16_MODBUS/CRC16_CCITT/CRC16_XMODEM/CRC32/SUM8/SUM16_LE/SUM16_BE/XOR/LRC/NONE 标准向量；append/verify round-trip 与篡改检测；与 crc16Modbus 一致性；NONE/非法类型/越界防御；name/fromName/width 映射",
      "doesNotProve": "真实设备兼容性、Named Pipe IPC 契约、校验算法自动识别"
    },
    {
      "command": "backend/build/serialscope-frame-decoder-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "确认既有 FrameDecoder 测试无回归（ProtocolUtils 未被改动）",
      "doesNotProve": "ChecksumEngine 行为"
    },
    {
      "command": "npm run build:backend",
      "kind": "native-build",
      "status": "passed",
      "purpose": "验证 C++ 构建，含新增 serialscope-checksum-engine-tests 目标",
      "doesNotProve": "运行时校验行为"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "验证 JS 语法",
      "doesNotProve": "Electron UI 行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "验证 change 包结构与 evidence JSON（15 个活动 change）",
      "doesNotProve": "产品行为"
    }
  ],
  "residualRisk": [
    "真实物理串口设备未授权，自动校验填充/验证接入由后续 change 单独评估授权",
    "CRC 参数化（refin/refout/init/xorout/多项式）本步固定默认值，非标协议留作后续可配置扩展",
    "ChecksumEngine 暂未接入 Named Pipe JSON-RPC 方法，IPC 契约未改变（本步为纯内部库）"
  ],
  "handoff": {
    "state": "ready-for-review",
    "request": "核对算法向量、round-trip/篡改边界、防御性与证据范围"
  }
}
```
