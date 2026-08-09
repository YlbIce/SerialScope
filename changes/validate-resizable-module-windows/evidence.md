# Evidence: validate-resizable-module-windows

```json
{
  "change": "validate-resizable-module-windows",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T06:30:00Z",
  "verification": [
    {"command": "npm run test:production-simulator", "kind": "production-frontend-automation", "status": "passed", "purpose": "通过生产 Electron CDP 对 serial-config=560x680、terminal=1050x760、trend=1120x720、rules=980x680、macros=1080x740、simulator=1040x700 逐个执行 Renderer window.resizeTo，并由 outerWidth/outerHeight 精确回读；每次调整后确认目标页面和后端连接仍可用", "doesNotProve": "真实硬件串口或用户拖动边框的人机感受"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证窗口创建和前端测试脚本可解析", "doesNotProve": "运行时窗口尺寸"}
  ],
  "residualRisk": ["自动化使用 Renderer window.resizeTo 验证编程式调整和回读，未替代每种 Windows DPI 下用户拖动边框的人工体验验证。"],
  "handoff": {"state": "review-passed", "review": "独立只读审核 conditionally-approved（P1=0）；设计文档已校正为实际的 Renderer window.resizeTo/outerWidth 自动化。P2：不同 DPI 下拖动边框与窗口吸附仍待人工体验验收。", "request": "不得自动归档。"}
}
```
