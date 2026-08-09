# Evidence: migrate-renderer-to-react

```json
{
  "change": "migrate-renderer-to-react",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T16:30:00Z",
  "verification": [
    {
      "command": "official React and React Flow documentation review",
      "kind": "dependency-selection",
      "status": "passed",
      "purpose": "确认 React 19 的组件模型、React Flow 的 React 集成和 MIT 开源许可。",
      "doesNotProve": "本项目构建、运行或协议兼容性。"
    },
    {
      "command": "npm install --save react@19.2.0 react-dom@19.2.0 @xyflow/react@12.10.0 && npm install --save-dev vite@7.3.1 @vitejs/plugin-react@5.1.1",
      "kind": "dependency-install",
      "status": "passed",
      "purpose": "安装 React/Vite/React Flow 迁移所需受控依赖。",
      "doesNotProve": "任何 React Renderer 行为；首次默认 registry 超时后，改用命令级 npmmirror registry 安装成功。"
    },
    {
      "command": "npm run test:react-workbench-ui",
      "kind": "visible-electron-ui-integration",
      "status": "passed",
      "purpose": "在隔离 Electron 测试窗口（sandbox=false）验证 Vite 生产构建、React Flow 工作台挂载、节点编辑和独立窗口缩放。",
      "doesNotProve": "Main 进程 serialscope:// 路由、工作台 sandbox=false 例外、Named Pipe/COM10/COM11 经 React UI 的端到端收发、sandbox=true 加载，旧终端和其余模块已经完成 React 迁移，或真实硬件串口。"
    }
  ],
  "residualRisk": ["React 当前仅承载独立通信测试工作台；旧终端和其余模块仍使用原生 renderer。", "当前 Windows/Electron 环境下 sandbox=true 无法加载 Vite ESM，工作台例外使用 sandbox=false，但保留 contextIsolation、nodeIntegration=false 与 CSP。", "真实硬件验证未授权。"],
  "review": {"status": "conditionally-approved", "p1": 0, "p2": 1, "summary": "独立工作台阶段安全边界已复审；sandbox=false 例外、Main 路由和 React UI 串口端到端仍未覆盖。"},
  "handoff": {"state": "implementing", "request": "完成主窗口与其余模块迁移，并消除 sandbox=false 例外、补齐 Main 路由及 React UI 串口端到端后再发起完整审核；不得自动归档。"}
}
```
