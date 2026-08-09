# Tasks: migrate-named-pipe-json-rpc

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 依赖 PoC | json-rpc-cxx compile probe | vcpkg 安装并构建请求、批处理、notification、参数错误最小程序 | 依赖不可获取或语义不符合；改用已有 nlohmann_json dispatcher 并记录 |
| JSON-RPC 语义与客户端 | `npm run test:named-pipe` | ready、ping、未知方法、batch、数组 params、Main client、ready timeout | 非 2.0 响应、错误码错误或启动悬挂 |
| 消息边界与超限 | `npm run test:named-pipe` | 4 MiB+1 长度前缀被拒绝，随后新客户端 ping 成功 | 解析错位、无错误或服务端不可恢复 |
| Pipe ACL 与单连接 | security integration | Owner DACL、跨会话拒绝实现、远程拒绝、第二客户端 `ERROR_PIPE_BUSY`、5 秒 ready 超时 | 开放访问、竞争连接或启动悬挂 |
| JSON-RPC 语义 | backend RPC integration | `ports.list`、未知方法、无效 params | 非 2.0 响应或请求悬挂 |
| Electron 桥 | Electron dev smoke | Main 调用 RPC、Renderer 收通知、后端重启 | Renderer 直连网络、无恢复状态 |
| COM10/COM11 | virtual serial integration | 打开、双向收发、最大 fixed 帧 | 数据缺失、静默丢弃或连接失效 |
| 构建与过程 | build/check/process | `npm run build:backend`、`npm run check`、`npm run process:check` | 任一失败 |

## Checklist

- [x] RED：记录 WebSocket 最大 fixed 帧验证 blocked，停止旧链路优化
- [x] 执行 `json-rpc-cxx` PoC，或记录安装受阻后的可替换 fallback
- [x] 实现 Named Pipe 长度前缀与 ACL
- [x] 实现 `backend.ready` / `backend.ping` 与 Electron Main/Preload 基础桥、5 秒 ready 超时与方法白名单
- [x] 迁移现有 C++ 串口 RPC 方法和通知，并升级至 CSerialPort v5
- [x] 迁移 Renderer 桥（阶段 2，开发启动冒烟通过）
- [x] 运行阶段 2 映射验证并写入 evidence
- [x] 阶段 1 独立只读审核与 L3 人工闸门
- [x] 解决 CSerialPort 4.3.3 与 ELTIMA COM10/COM11 的数据面兼容性
- [x] 验证最大 128 KiB 固定帧、恰好 4 MiB 出站边界、慢客户端和第二客户端占用
- [x] 实现跨 Windows 会话拒绝与读/断开句柄生命周期同步
- [ ] 跨用户与跨 Windows 会话实际拒绝验证（人工环境）
- [ ] 阶段 2 独立只读审核与 L3 人工闸门

## Explicit not-run / blocked

- 真实物理串口验证：`not-run`，未授权且不在本 change 范围。
