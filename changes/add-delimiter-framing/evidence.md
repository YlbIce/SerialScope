# Evidence: add-delimiter-framing

```json
{
  "change": "add-delimiter-framing",
  "riskTier": "L2",
  "recordedAt": "2026-08-02T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 SerialSession::handleReceived",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认当前读取块直接作为 serial:rx 发出",
      "doesNotProve": "delimiter 模式的目标行为"
    }
  ],
  "remediation": [
    {
      "command": "backend/build/serialscope-frame-decoder-tests.exe（固定 1 MiB 缓冲的首次运行）",
      "kind": "test-harness",
      "status": "failed",
      "purpose": "发现测试对象占用默认线程栈会触发栈溢出",
      "doesNotProve": "FrameDecoder 逻辑失败",
      "observed": "退出码 -1073741571（栈溢出）；测试对象改为堆分配后重建并通过。"
    }
  ],
  "verification": [
    {"command": "临时后端以 COM10 delimiter/LF 打开；COM11 写入 A/LF、B/LF、C 后补 LF", "kind": "virtual-serial-integration", "status": "passed", "purpose": "验证粘连 A/LF+B/LF 与跨读取 C/LF 被拆为三个 RX 帧", "doesNotProve": "真实设备兼容性、缓冲溢出或其他协议策略"},
    {"command": "backend/build/serialscope-frame-decoder-tests.exe", "kind": "unit-test", "status": "passed", "purpose": "验证 raw、粘连/拆分、恰好 1 MiB 无分隔符、超限完整帧与恢复接收", "doesNotProve": "CSerialPort 回调时序、Renderer GUI 或真实设备兼容性"},
    {"command": "临时后端拒绝 delimiter=HEX:GG；随后省略 framing 打开 COM10，并由 COM11 写入 RAW_DEFAULT", "kind": "virtual-serial-integration", "status": "passed", "purpose": "验证无效 HEX 配置被拒绝且 raw 默认模式保持接收", "doesNotProve": "所有 HEX 格式与 Renderer GUI 交互"},
    {"command": "npm run build:backend", "kind": "native-build", "status": "passed", "purpose": "验证 C++ 构建", "doesNotProve": "运行时帧行为"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证 Renderer 语法", "doesNotProve": "Electron UI 行为"},
    {"command": "npm run process:check", "kind": "process-contract", "status": "passed", "purpose": "验证 change 包", "doesNotProve": "产品行为"},
    {"command": "真实物理串口验证", "kind": "hardware", "status": "not-run", "purpose": "确认真实设备上的 framing 兼容性", "doesNotProve": "任何物理设备兼容性", "reason": "未获设备操作授权"}
  ],
  "residualRisk": ["Renderer GUI 操作与真实物理串口验证未运行。", "定长、空闲超时、长度字段和协议插件仍为后续 change。"],
  "handoff": {"state": "archived", "reviewResult": "approved", "archiveProof": "changes/add-delimiter-framing/archive.md"}
}
```
