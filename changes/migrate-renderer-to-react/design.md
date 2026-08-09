# Design: migrate-renderer-to-react

## Decisions

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 构建 | Vite + React 19 | 适配 Electron 本地静态 Renderer，快速热更新和标准 JSX 构建。 |
| 节点画布 | `@xyflow/react`（React Flow，MIT） | 提供拖拽、缩放、连线、节点/边状态与自定义节点，适合后续通信测试流程。 |
| 后端边界 | 不修改 `src/main`/`preload` 公开 API | 前端迁移不扩大 IPC 权限。 |
| 状态 | 按领域拆分 hooks/store：serial、terminal、macros、simulator、layout | 消除当前单 Renderer 文件的全局可变状态。 |
| 迁移方式 | 壳与核心终端优先，页面模块逐步替换 | 每阶段可启动、可回归，避免 Big Bang 重写。 |

## Risks and mitigations

| 风险 | 缓解或验证方式 |
| --- | --- |
| Vite 资源路径在 packaged Electron 中失效 | `file:` 构建与生产 `npm run start` 自动化验证。 |
| React 重渲染影响高频报文 | 日志缓冲、批量刷新和虚拟列表；用高频 COM10/COM11 场景回归。 |
| 迁移时 IPC 权限漂移 | Preload 接口不新增能力；自动化断言 sandbox/contextIsolation。 |
| 现有 UI 行为回归 | 迁移矩阵逐页验证，失败不掩盖。 |

## Out of scope

节点执行器、断言与报告实现；它们属于测试工作台 change。
