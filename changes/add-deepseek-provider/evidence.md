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
      "command": "AI 配置持久化（不含 Key）集成测试",
      "kind": "integration-test",
      "status": "not-run",
      "purpose": "验证 ai-config.json 持久化 provider/enabled/allowDataUpload 且不含 Key",
      "doesNotProve": "真实 DeepSeek 调用",
      "reason": "尚未实现，G2 后实施"
    },
    {
      "command": "无 Key 回退 mock / 有 Key 真实调用",
      "kind": "integration-test",
      "status": "not-run",
      "purpose": "验证 provider 分发（回退 mock vs 调 DeepSeek）",
      "doesNotProve": "真实模型输出质量",
      "reason": "真实调用需 DEEPSEEK_API_KEY；尚未实现"
    },
    {
      "command": "禁止上传拒绝 / API 失败明确 error",
      "kind": "integration-test",
      "status": "not-run",
      "purpose": "验证上传边界与错误处理",
      "doesNotProve": "正常上传路径",
      "reason": "尚未实现"
    },
    {
      "command": "AI 配置窗口 UI 测试",
      "kind": "ui-test",
      "status": "not-run",
      "purpose": "验证配置窗口操作与风险提示",
      "doesNotProve": "真实调用",
      "reason": "尚未实现"
    }
  ],
  "residualRisk": [
    "真实 DeepSeek 调用需 DEEPSEEK_API_KEY；无 Key 时仅验证 mock 回退",
    "上传规约文本+串口数据到云端为永久性数据外泄（用户已授权）",
    "提示词质量影响解析准确率"
  ],
  "handoff": {
    "state": "draft",
    "reviewStage": "G2-design",
    "reviewResult": "conditionally-approved",
    "reviewRound": 1,
    "p1": 0,
    "p2": 2,
    "p2Notes": [
      "需明确 Main 拦截 ai.parseProtocol/ai.generateCommands 的分发点（在 backend:rpc handler 或新增 RPC 层），实现真实调用 vs 回退 mock 的判断",
      "Main 侧真实调用的 allowDataUpload 判断须独立于 C++ AiAdapter（避免绕过授权门面），并统一与 C++ ai.configure 的 allowDataUpload 状态一致"
    ],
    "request": "G2 设计评审 conditionally-approved（P1=0/P2=2）；实现时解决两个 P2 分发点细节；真实调用需 DEEPSEEK_API_KEY"
  }
}
```
