# Tasks: add-standalone-windows-and-macro-editor

## 场景—验证映射

| 场景 | 验证 | 命令或步骤 | 失败边界 |
| --- | --- | --- | --- |
| 多窗口 | production Electron integration | 逐项打开 terminal/trend/rules/macros/simulator 并检查目标页和 IPC 状态 | 子窗口无状态或直连 Pipe |
| 宏编辑 | Renderer integration | 新增/编辑/删除/重载宏 | 本地保存缺失或执行内容错误 |
| 回归 | checks | `npm run check`、`npm run process:check` | 任一失败 |

## Checklist

- [x] 实施 Main/Preload 多窗口桥
- [x] 实施宏编辑器和持久化
- [x] 运行 UI 与回归验证并记录 evidence
- [ ] 独立只读审核
