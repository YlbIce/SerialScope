# Evidence: add-protocol-ai-parse

```json
{
  "change": "add-protocol-ai-parse",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 backend/src/NamedPipeServer.cpp 与 src/main/main.js",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认后端无 ai.* 方法、main allowedRpcMethods 白名单无 ai.*",
      "doesNotProve": "ai.parseProtocol 的目标行为"
    }
  ],
  "verification": [
    {
      "command": "npm run test:ai-rpc（node scripts/test-ai-rpc.js）",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "验证后端 ai.status 默认状态、ai.parseProtocol 未启用被拒（not-enabled）、ai.chat 未列入被拒（-32601）、ai.configure 启用、启用后 ai.status 与 ai.parseProtocol mock 结果",
      "doesNotProve": "前端 UI 渲染、真实网络 AI provider"
    },
    {
      "command": "npm run test:protocol-ai-ui（electron scripts/test-protocol-ai-ui.js）",
      "kind": "ui-test",
      "status": "passed",
      "purpose": "验证 page-protocol 页面导航、AI 初始未启用与解析按钮禁用、启用 AI、输入规约解析渲染 0xAA 0x55、mock 两字段、字段校正保存到 localStorage",
      "doesNotProve": "真实协议解析价值（mock）、真实网络 provider、虚拟/真实串口"
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
      "purpose": "验证 C++ 构建（含 AiAdapter.cpp 接入 serialscope-backend 与 ai.* 方法）",
      "doesNotProve": "运行时 IPC 行为"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "验证 JS 语法（main.js 白名单、renderer.js 新页面逻辑）",
      "doesNotProve": "Electron UI 行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "验证 change 包结构与 evidence JSON（18 个活动 change）",
      "doesNotProve": "产品行为"
    }
  ],
  "residualRisk": [
    "真实网络 AI provider 与串口/AI 数据上传为后续 L3 change，需用户显式授权",
    "ai.parseProtocol 为 mock 输出，真实协议解析价值待真实 provider",
    "前端校正 UI 仅经 Electron UI 自动化验证，不同 DPI 下的主观视觉未覆盖",
    "test:protocol-ai-ui 的 stopBackend 清理会产生 'Named Pipe 后端已断开' 噪音，不影响断言"
  ],
  "handoff": {
    "state": "review-passed",
    "reviewResult": "conditionally-approved",
    "reviewRound": 1,
    "p1": 0,
    "p2": 2,
    "p2Notes": [
      "ai.configure 的 enabled/allowDataUpload 用 .get<bool>() 强转，非 bool 输入报错但不崩，建议后续明确校验",
      "前端校正 UI 仅 Electron 自动化验证，不同 DPI 视觉未覆盖；mock 解析价值待真实 provider"
    ],
    "request": "不得自动归档；P2 留待真实 provider 接入前处理"
  }
}
```
