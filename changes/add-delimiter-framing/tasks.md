# Tasks: add-delimiter-framing

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 当前读取块被直接当帧 | RED 代码检查 | 检查 `handleReceived` 直接 emit | 读取块没有累计器 |
| 粘连/拆分 LF 帧 | virtual delimiter integration | COM11 向 delimiter/LF 的 COM10 发送 `A\nB\nC` 后补 `\n` | RX 数量或 HEX 不匹配 |
| 1 MiB 阈值与恢复 | FrameDecoder native tests | `backend/build/serialscope-frame-decoder-tests.exe` | 上限、超限或恢复断言失败 |
| raw 默认与非法 HEX | framing protocol integration | 临时后端拒绝 `HEX:GG`，再以省略 framing 的 COM10 接收数据 | 无效配置被接受或 raw 不接收 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| Renderer 可解析 | syntax check | `npm run check` | 语法失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |

## Checklist

- [x] RED：记录读取块即帧的现有缺口
- [x] 实现 FrameDecoder 与 SerialSession 接线
- [x] 增加 Renderer framing 控件与配置
- [x] 运行虚拟串口 delimiter、raw 默认和非法配置集成验证
- [x] 运行构建、native tests 与检查并写 evidence
- [x] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 真实物理设备验证：`not-run`，未授权且不在本次范围。
