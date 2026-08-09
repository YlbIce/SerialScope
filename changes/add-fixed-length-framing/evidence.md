# Evidence: add-fixed-length-framing

```json
{
  "change": "add-fixed-length-framing",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T00:00:00Z",
  "preImplementation": [{"command": "检查 FrameDecoder 与 parseFrameConfig", "kind": "code-inspection", "status": "passed", "purpose": "确认当前仅有 raw/delimiter", "doesNotProve": "fixed 行为"}],
  "verification": [
    {"command": "backend/build/serialscope-frame-decoder-tests.exe", "kind": "unit-test", "status": "passed", "purpose": "验证 fixed=4 的粘连与跨读取累计，以及既有模式", "doesNotProve": "真实设备"},
    {"command": "临时后端以 COM10 fixed/frameSize=4 打开，COM11 写入 01..06 后补 07 08", "kind": "virtual-serial-integration", "status": "passed", "purpose": "验证 COM10/COM11 定长帧累计", "doesNotProve": "真实设备"},
    {"command": "临时后端先打开 COM10，再请求 fixed/frameSize=0、4.5、131073", "kind": "integration-test", "status": "passed", "purpose": "验证零值、非整数和超上限被拒绝，既有有效连接保持打开", "doesNotProve": "最大合法帧的端到端交付"},
    {"command": "COM10/COM11 fixed/frameSize=131072 最大帧端到端交付", "kind": "virtual-serial-integration", "status": "blocked", "reason": "现有 WebSocket 实时队列链路未收到完成帧；用户要求先迁移到 Named Pipe + JSON-RPC 再继续验证。", "purpose": "验证最大合法帧可靠到达客户端", "doesNotProve": "Named Pipe 迁移后的传输行为"},
    {"command": "npm run build:backend", "kind": "native-build", "status": "passed", "purpose": "验证构建", "doesNotProve": "运行时行为"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证 Renderer", "doesNotProve": "GUI 行为"},
    {"command": "npm run process:check", "kind": "process-contract", "status": "passed", "purpose": "验证 change", "doesNotProve": "产品行为"}
  ],
  "residualRisk": ["旧 WebSocket 传输的最大 fixed 帧未端到端证明，变更处于 blocked。", "Renderer GUI 和真实物理串口验证未运行。"],
  "handoff": {"state": "blocked", "request": "由 migrate-named-pipe-json-rpc 替换传输层后重新验证最大 fixed 帧；本 change 不得归档。"}
}
```
