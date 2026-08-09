# Evidence: adopt-desktop-menu-toolbar

```json
{
  "change": "adopt-desktop-menu-toolbar",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T05:30:00Z",
  "verification": [
    {"command": "npm run test:electron-ui", "kind": "renderer-action-and-visible-toolbar-integration", "status": "passed", "purpose": "验证与菜单共用的受限 ui:action Renderer 入口能切换宏/串口页面，顶部工具栏可完成 COM10/COM11 打开、发送、关闭及其余既有宏/模拟器交互", "doesNotProve": "生产 Main 的原生菜单项点击或真实硬件串口"},
    {"command": "启动 scripts/run-electron.js 并目视检查窗口", "kind": "visible-desktop-inspection", "status": "passed", "purpose": "实际 Windows Electron 窗口显示文件、视图、串口、窗口、帮助菜单栏和精简后的顶部工具栏；截图 artifacts/production-menu-toolbar.png", "doesNotProve": "每一个菜单项的人工点击或真实硬件串口"},
    {"command": "npm run check && npm run process:check", "kind": "regression", "status": "passed", "purpose": "验证 JavaScript 可解析及活动变更包契约", "doesNotProve": "可见菜单交互"}
  ],
  "residualRisk": ["实际窗口已确认原生菜单栏可见；每一个原生菜单项的人工点击仍未逐项自动化覆盖。"],
  "handoff": {"state": "review-passed", "review": "独立只读审核 conditionally-approved（P1=0）。P2：菜单项逐项人工点击仍未自动化覆盖；测试仅覆盖其共用的受限 Renderer action 与可见工具栏。", "request": "不得自动归档。"}
}
```
