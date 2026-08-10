# Evidence: fix-window-close-destroyed-error

```json
{
  "change": "fix-window-close-destroyed-error",
  "riskTier": "L1",
  "recordedAt": "2026-08-10T00:00:00Z",
  "verification": [
    {
      "command": "node scripts/verify-window-close.js",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证修复后 workbenchExecution.end(webContentsId)（用缓存 id）不抛错；并演示旧访问方式会抛 Object has been destroyed",
      "doesNotProve": "所有窗口关闭路径的端到端行为（未启动完整应用）"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "验证 main.js 修改无语法错误",
      "doesNotProve": "运行期行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "验证变更包结构合规",
      "doesNotProve": "功能行为"
    }
  ],
  "residualRisk": [
    "未在完整应用中逐个关闭主窗口/各模块窗口做端到端验证（需手动或 test:electron-ui 覆盖）；当前修复通过代码审查与定向单测确认"
  ]
}
```
