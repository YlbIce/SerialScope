# Tasks: migrate-renderer-to-react

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| React 构建与安全启动 | React production smoke | 新增 `npm run test:react-renderer` | 挂载失败、Preload 不可用或 Node 权限泄露。 |
| 终端收发 | COM10/COM11 UI 自动化 | 同一生产 smoke | RX/TX、日志或状态错误。 |
| 独立窗口 | 多窗口 UI 自动化 | 迁移现有模块窗口测试 | 子窗口加载旧资源或丢失状态。 |
| 高速查询 | 自动查询回归 | `npm run test:auto-query-backpressure-ui`、`npm run test:auto-query-timing` | 单在途/收敛退化。 |

## Checklist

- [x] 确认 React 19、Vite、React Flow 的适配与许可证
- [x] 安装受控前端依赖（通过 npmmirror）并建立 Vite 入口
- [x] 迁移通信测试工作台应用壳、串口状态与通知订阅（以独立窗口渐进上线）
- [ ] 迁移其余模块和独立窗口入口
- [x] 运行 React 工作台映射验证并写入 evidence.md
- [ ] L2 独立只读审核

## Explicit not-run / blocked

- React 迁移尚未实现，生产 UI 与虚拟串口验证未运行。
