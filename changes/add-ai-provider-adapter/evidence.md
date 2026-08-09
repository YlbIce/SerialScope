# Evidence: add-ai-provider-adapter

```json
{
  "change": "add-ai-provider-adapter",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 backend/src/NamedPipeServer.cpp 与 backend/CMakeLists.txt",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认后端无 AI 集成点、无 HTTP/Beast 依赖、JSON-RPC 方法列表无 ai.*",
      "doesNotProve": "AiAdapter 的目标行为"
    }
  ],
  "verification": [
    {
      "command": "backend/build/serialscope-ai-adapter-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证授权边界（未启用 not-enabled / 禁止上传+需上传 provider 拒绝 data-upload-denied / 允许上传放行）、mock 确定性（chat/parseProtocol/generateCommands）、provider 按名选择、空 provider、调用计数",
      "doesNotProve": "真实 AI provider、Named Pipe IPC 契约、真实数据上传行为"
    },
    {
      "command": "backend/build/serialscope-checksum-engine-tests.exe 与 serialscope-frame-decoder-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "确认既有后端测试无回归",
      "doesNotProve": "AiAdapter 行为"
    },
    {
      "command": "npm run build:backend",
      "kind": "native-build",
      "status": "passed",
      "purpose": "验证 C++ 构建，含新增 serialscope-ai-adapter-tests 目标（修复 providerName 悬垂引用警告）",
      "doesNotProve": "运行时适配行为"
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
      "purpose": "验证 change 包结构与 evidence JSON（17 个活动 change）",
      "doesNotProve": "产品行为"
    }
  ],
  "residualRisk": [
    "真实网络 provider（Ollama/DeepSeek）与串口/AI 数据上传为后续 L3 change，需用户显式授权",
    "本步未接入 Named Pipe JSON-RPC，ai.* 未暴露到前端，IPC 契约未改变",
    "未来在 IPC 暴露 ai.* 时若绕过 AiAdapter 授权检查会破坏数据边界，须在接入 change 中强制复用本门面"
  ],
  "handoff": {
    "state": "ready-for-review",
    "request": "核对授权边界（not-enabled / data-upload-denied）、mock 确定性与无网络行为声明"
  }
}
```
