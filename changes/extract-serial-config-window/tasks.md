# Tasks: extract-serial-config-window

## 场景—验证映射

| 场景 | 验证 | 命令或步骤 | 失败边界 |
| --- | --- | --- | --- |
| 主页面精简 | production Electron | 主页不存在连接参数面板 | 参数表单仍在主页 |
| 独立配置 | production Electron + COM10/COM11 | 打开配置窗口，设置 COM10 后完成收发 | 配置窗口无状态或无法打开串口 |
| 草稿同步 | 多窗口 | 配置改动后其他窗口使用相同草稿 | 参数陈旧 |

## Checklist

- [x] 移动配置界面并补充 Main 菜单/窗口路由
- [x] 实现草稿本地同步
- [x] 完成生产 UI 与虚拟串口验收
- [ ] 独立只读审核
