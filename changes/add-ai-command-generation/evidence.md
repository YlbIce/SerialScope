# Evidence: add-ai-command-generation

```json
{
  "change": "add-ai-command-generation",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 backend/src/NamedPipeServer.cpp 与 src/main/main.js",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认后端无 ai.generateCommands 方法、main 白名单无 ai.generateCommands",
      "doesNotProve": "ai.generateCommands 的目标行为"
    }
  ],
  "verification": [
    {
      "command": "npm run test:ai-rpc（node scripts/test-ai-rpc.js）",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "验证 ai.generateCommands 未启用被拒（not-enabled）、启用后返回 mock 命令列表（ReadDeviceInfo/AA 55 01、ResetDevice），并确认既有 ai.* 场景无回归",
      "doesNotProve": "前端 UI 渲染、真实命令生成价值"
    },
    {
      "command": "npm run test:protocol-ai-ui（electron scripts/test-protocol-ai-ui.js）",
      "kind": "ui-test",
      "status": "passed",
      "purpose": "验证命令生成区：生成按钮启用、生成 2 条命令、首条 ReadDeviceInfo HEX 'AA 55 01'、加入宏库后 localStorage 持久化（serialscope.macros）",
      "doesNotProve": "真实命令生成价值（mock）、虚拟/真实串口发送"
    },
    {
      "command": "backend/build/serialscope-ai-adapter-tests.exe、serialscope-checksum-engine-tests.exe、serialscope-frame-decoder-tests.exe",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "确认既有后端测试无回归",
      "doesNotProve": "IPC 分发与前端 UI"
    },
    {
      "command": "npm run build:backend",
      "kind": "native-build",
      "status": "passed",
      "purpose": "验证 C++ 构建（含 ai.generateCommands 分发）",
      "doesNotProve": "运行时 IPC 行为"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "验证 JS 语法（main 白名单、renderer 命令生成逻辑）",
      "doesNotProve": "Electron UI 行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "验证 change 包结构与 evidence JSON（19 个活动 change）",
      "doesNotProve": "产品行为"
    }
  ],
  "residualRisk": [
    "真实网络 AI provider 与自然语言命令生成为后续 L3 change",
    "命令响应模板关联（F-014）留待后续",
    "mock 命令为固定示例，真实价值待真实 provider"
  ],
  "handoff": {
    "state": "review-passed",
    "reviewResult": "approved",
    "reviewRound": 1,
    "p1": 0,
    "p2": 2,
    "p2Notes": [
      "addCommandToMacros 用宏名去重，AI 若生成重名命令会互相覆盖（mock 命令名唯一，真实 provider 需注意）",
      "命令→宏映射假设 code 为完整帧（含校验）；动态填参/补校验（F-014）留待后续"
    ],
    "request": "无 P1；已核验授权边界（not-enabled）、main 白名单、前端 escapeHtml 防 XSS、无上传；可归档（需用户确认）"
  }
}
```
