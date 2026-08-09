# Evidence: add-standalone-windows-and-macro-editor

```json
{
  "change": "add-standalone-windows-and-macro-editor",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T05:00:00Z",
  "verification": [
    {"command": "npm run test:electron-ui", "kind": "visible-desktop-and-virtual-serial-integration", "status": "passed", "purpose": "在可见 Electron 窗口中打开宏独立窗口，读取后端初始状态；创建、持久化和执行 HEX 宏，并由 COM11 原生辅助程序读取 CA FE", "doesNotProve": "全部模块窗口的人工可用性或真实设备串口行为"},
    {"command": "npm run test:production-simulator", "kind": "production-main-module-window-integration", "status": "passed", "purpose": "以生产 Main/sandbox=true 逐项打开并关闭 terminal、trend、rules、macros、simulator 五个独立窗口，验证其目标页面与后端已连接状态；同时覆盖模拟窗口接管与恢复", "doesNotProve": "真实设备串口行为或每个控件的人工主观可用性"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证 Main、Preload 和 Renderer 可解析", "doesNotProve": "可见 UI 行为"}
  ],
  "residualRisk": ["自动化逐项验证五个窗口的页面与后端状态，但没有替代每个可视化控件的人工主观可用性检查。", "宏本地保存不等于真实设备写入授权。"],
  "handoff": {"state": "review-passed", "review": "独立只读审核 conditionally-approved（P1=0）。P2：自动化只逐项打开并验证宏窗口，其他模块复用同一创建路径；跨窗口 localStorage 修改依赖存储同步。", "request": "不得自动归档。"}
}
```
