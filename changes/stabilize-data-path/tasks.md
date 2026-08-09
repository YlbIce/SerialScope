# Tasks: stabilize-data-path

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 导入前无本 change 的实现约束 | 代码检查清单 RED | 人工对照现有 WebSocket 队列、连接回调与同步 `renderLog` | 队列无上限、旧 close 可重连、每帧外日志立即重绘 |
| C++ 修改保持可编译 | native build | `npm run build:backend` | CMake/编译器报告失败 |
| 虚拟串口双向收发 | virtual serial integration | 临时后端打开 COM10，COM11 注入 RX 并接收 TX | RX/TX 任一方向内容不匹配 |
| 实时队列满载后仍可获得命令结果 | backpressure control delivery | 临时后端以 COM10/COM11 灌入实时数据，再请求 `serial:send` | 找不到命令 result 或控制消息被丢弃 |
| Renderer 和脚本可解析 | syntax check | `npm run check` | Node 报语法错误 |
| 两个 change 包均合法 | process contract | `npm run process:check` | 缺失字段或非法 evidence JSON |
| 实际 Electron 连接恢复 | manual smoke | 启动应用并重启后端、观察重连 | 未在本轮执行时标 not-run |

## Checklist

- [x] RED：记录现有队列、重连和同步渲染缺口
- [x] 实施 C++ 传输上限与命令校验
- [x] 实施 Renderer 重连、渲染、统计与 profile 容错
- [x] GREEN：运行 native build、syntax check 与 process check
- [x] Mode S：准备独立只读审核；本次不归档

## Explicit not-run / blocked

- Electron 手工 smoke：`not-run`，本轮优先完成静态/编译验证；不以语法检查冒充 UI 行为验证。
- 真实串口硬件验证：`not-run`，未获设备操作授权，且本次不改变串口字节语义。
