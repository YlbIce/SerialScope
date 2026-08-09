# Evidence: <change-id>

将下面 JSON 代码块替换为本 change 的真实结果。`npm run process:check` 会解析该代码块，而不是只检查文件存在。

```json
{
  "change": "replace-with-kebab-case-change-id",
  "riskTier": "L2",
  "recordedAt": "YYYY-MM-DDTHH:mm:ssZ",
  "verification": [
    {
      "command": "npm run <targeted-command>",
      "kind": "unit-test",
      "status": "not-run",
      "purpose": "说明验证哪个验收场景",
      "doesNotProve": "说明未覆盖的边界",
      "reason": "仅在 status 为 blocked/not-run 时填写"
    }
  ],
  "residualRisk": ["未覆盖的真实风险"],
  "handoff": {
    "state": "ready-for-review",
    "request": "核对场景、验证与证据边界"
  }
}
```
