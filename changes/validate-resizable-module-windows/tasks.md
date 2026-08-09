# Tasks: validate-resizable-module-windows

## 场景—验证映射

| 场景 | 验证 | 命令或步骤 | 失败边界 |
| --- | --- | --- | --- |
| 子窗口调尺寸 | Production Electron CDP | 对六种模块设置不同宽高并回读 bounds | 尺寸未变化、受异常约束或页面失效 |
| 回归 | Production Electron CDP | 调整后检查模块页面/后端状态 | Resize 后白屏或断连 |

## Checklist

- [x] 显式审计 BrowserWindow 尺寸约束
- [x] 实施/扩展生产前端自动化
- [x] 运行并记录每个模块的 resize 证据
- [ ] 独立只读审核
