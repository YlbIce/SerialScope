# Tasks: adopt-desktop-menu-toolbar

## 场景—验证映射

| 场景 | 验证 | 命令或步骤 | 失败边界 |
| --- | --- | --- | --- |
| 菜单操作 | Electron 可见 UI | 菜单切换页面、打开独立窗口、触发配置操作 | 菜单无响应或绕过 Preload |
| 工具栏 | Electron UI integration | 打开/关闭/发送复用串口配置 | 按钮缺失或收发失败 |

## Checklist

- [x] 实施 Main 菜单、Preload 受限 UI action 和顶部工具栏
- [x] 运行可见桌面交互验收并写入 evidence
- [ ] 独立只读审核
