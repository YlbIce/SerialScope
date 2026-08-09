# Evidence: extract-serial-config-window

```json
{
  "change": "extract-serial-config-window",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T06:15:00Z",
  "verification": [
    {"command": "npm run test:production-simulator", "kind": "production-desktop-and-virtual-serial-integration", "status": "passed", "purpose": "生产 Main/sandbox=true 断言主窗口恢复 terminal 页面且不含连接参数面板；打开 serial-config 窗口并验证专用 body 样式隐藏侧栏、总工具栏和指标区；在 COM11/9600 打开串口后主窗口收到状态与草稿同步，再完成 COM10/COM11 模拟器交互", "doesNotProve": "真实硬件串口或每项菜单的人机点击"},
    {"command": "npm run test:electron-ui", "kind": "visible-desktop-regression", "status": "passed", "purpose": "回归可见 Electron 窗口中的收发、宏和模拟器交互", "doesNotProve": "生产 Main 的独立配置窗口"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证 Main、Preload 和 Renderer 可解析", "doesNotProve": "运行时串口行为"}
  ],
  "residualRisk": ["串口草稿使用 localStorage storage 事件同步；并发编辑采用最后保存者覆盖。", "真实硬件串口仍需 L3 人工授权。"],
  "handoff": {"state": "review-passed", "review": "独立只读审核已复核共享布局恢复修复、主窗口拦截配置页跳转和专用轻量配置窗口样式，结论 conditionally-approved（P1=0）。", "request": "不得自动归档。"}
}
```
