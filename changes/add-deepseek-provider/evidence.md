# Evidence: add-deepseek-provider

```json
{
  "change": "add-deepseek-provider",
  "riskTier": "L3",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 src/main 与 backend AiAdapter",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认无真实 provider、无 HTTP 依赖；AiAdapter/mock 可作回退",
      "doesNotProve": "DeepSeek 调用行为"
    }
  ],
  "verification": [
    {
      "command": "npm run test:deepseek（无 DEEPSEEK_API_KEY）",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "验证 ai-config 持久化（不含 Key）、apiKey 不落盘、useDeepSeek 判定、禁止上传拒绝、无 Key 抛 no-api-key",
      "doesNotProve": "真实 DeepSeek 网络调用"
    },
    {
      "command": "npm run test:deepseek（设 DEEPSEEK_API_KEY 后）",
      "kind": "integration-test",
      "status": "not-run",
      "purpose": "验证真实 DeepSeek parseProtocol/generateCommands 端到端",
      "doesNotProve": "模型输出质量",
      "reason": "需用户在本机设 DEEPSEEK_API_KEY 环境变量运行；当前会话未设，无法在此验证"
    },
    {
      "command": "npm run test:ai-rpc / test:mcp-* / test:protocol-import",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "确认既有测试无回归",
      "doesNotProve": "DeepSeek 行为"
    },
    {
      "command": "npm run check / npm run process:check",
      "kind": "syntax-check / process-contract",
      "status": "passed",
      "purpose": "验证 JS 语法（含 deepseek-provider.js/ai-config.js）与 change 包结构（22 个活动 change）",
      "doesNotProve": "DeepSeek 运行行为"
    }
  ],
  "residualRisk": [
    "真实 DeepSeek 端到端未在当前会话验证（需 DEEPSEEK_API_KEY 环境变量，由用户本机运行）",
    "上传规约文本+串口数据到云端为永久性数据外泄（用户已授权）",
    "提示词质量影响解析准确率"
  ],
  "handoff": {
    "state": "ready-for-review",
    "reviewStage": "G3-implementation",
    "request": "G3 独立审核：核对 Node DeepSeek 调用、配置持久化（不含 Key）、真实-回退分发、串口上传边界、API 错误处理；真实调用 blocked 待用户本机验证"
  }
}
```
