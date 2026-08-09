# Tasks: add-length-field-framing

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 完整帧长度分帧 | FrameDecoder native tests | `backend/build/serialscope-frame-decoder-tests.exe` | 输出帧与期望不符 |
| 粘包多帧 | 同上 | 同上 | 帧数或内容不符 |
| 半包跨 push | 同上 | 同上 | 提前输出或缺失 |
| includesHeader 语义 | 同上 | 同上 | 帧总长计算错误 |
| 长度域大小端 | 同上 | 同上 | 大端读法错误 |
| 非法配置防御 | 同上 | 同上 | 崩溃/死循环 |
| 超限帧丢弃后恢复 | 同上 | 同上 | 丢弃后未恢复 |
| 既有模式无回归 | FrameDecoder native tests | 同上 | Raw/Delimiter/Fixed 断言失败 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |
| 既有 JS 语法 | syntax check | `npm run check` | 语法失败 |

## Checklist

- [x] 创建 change 包文档（proposal/design/specification/tasks/evidence/change.json）
- [x] RED：确认当前 FrameDecoder 无 Length 模式
- [x] 在 `FrameDecoder.{h,cpp}` 实现 `FrameMode::Length`
- [x] 扩展 `FrameDecoderTests.cpp` 覆盖 Length 场景
- [x] 运行 native tests 与 `npm run build:backend`
- [x] 运行 `npm run check`、`npm run process:check` 并写 evidence
- [x] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 真实物理串口验证：`not-run`，长度分帧为纯解码、不触碰串口，且未获设备操作授权。
- Named Pipe JSON-RPC 接入 length 配置：`not-run`，属后续 change，需单独评估。
