# Evidence: add-length-field-framing

```json
{
  "change": "add-length-field-framing",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 backend/src/FrameDecoder.h",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认当前仅支持 Raw/Delimiter/Fixed 三种模式，无长度分帧",
      "doesNotProve": "Length 模式的目标行为"
    }
  ],
  "verification": [
    {
      "command": "backend/build/serialscope-frame-decoder-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证 Length 完整帧/粘包/半包跨 push/includesHeader=true/2 字节大端/超限帧丢弃后恢复/非法配置防御，并确认 Raw/Delimiter/Fixed 无回归",
      "doesNotProve": "真实设备兼容性、Named Pipe IPC 契约、payload 内伪 header 误分帧边界"
    },
    {
      "command": "backend/build/serialscope-checksum-engine-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "确认既有 ChecksumEngine 测试无回归（ProtocolUtils 未改动）",
      "doesNotProve": "Length 分帧行为"
    },
    {
      "command": "npm run build:backend",
      "kind": "native-build",
      "status": "passed",
      "purpose": "验证 C++ 构建",
      "doesNotProve": "运行时分帧行为"
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
      "purpose": "验证 change 包结构与 evidence JSON（16 个活动 change）",
      "doesNotProve": "产品行为"
    }
  ],
  "residualRisk": [
    "真实物理串口设备未授权，Length 分帧接入真实设备解析由后续 change 单独评估授权",
    "header 出现在 payload 内可能误触发分帧，交由后续 AI/规则层处理（本步要求真实帧以 header 起始）",
    "Named Pipe JSON-RPC 接入 length 配置留作后续 change，本步 IPC 契约未改变"
  ],
  "handoff": {
    "state": "ready-for-review",
    "request": "核对 Length 分帧状态机、includesHeader/大小端语义、超限恢复与防御边界"
  }
}
```
