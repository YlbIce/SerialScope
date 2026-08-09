# Tasks: add-ai-provider-adapter

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 未启用拒绝 | AiAdapter native tests | `backend/build/serialscope-ai-adapter-tests.exe` | 未抛 not-enabled |
| 启用+mock 正常 | 同上 | 同上 | 未正常返回 |
| 禁止上传+需上传 provider 拒绝 | 同上 | 同上 | 未抛 data-upload-denied |
| mock chat/parseProtocol/generateCommands 确定性 | 同上 | 同上 | 结果不可断言/内容不符 |
| 未知 provider 拒绝 | 同上 | 同上 | 未抛 unknown-provider |
| 无网络行为 | 同上 | 同上 | 测试中发起任何连接 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |
| 既有 JS 语法 | syntax check | `npm run check` | 语法失败 |

## Checklist

- [x] 创建 change 包文档（proposal/design/specification/tasks/evidence/change.json）
- [x] RED：确认当前后端无任何 AI 集成点
- [x] 实现 `AiAdapter.{h,cpp}`（AiProvider/AiAdapter/MockAiProvider/模型/AiError）
- [x] 编写 `backend/tests/AiAdapterTests.cpp` 并在 CMake 注册
- [x] 运行 native tests 与 `npm run build:backend`
- [x] 运行 `npm run check`、`npm run process:check` 并写 evidence
- [x] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 真实网络 provider（Ollama/DeepSeek API）：`not-run`，属后续 L3 change，需用户显式授权上传。
- Named Pipe JSON-RPC 接入 `ai.*`：`not-run`，本步不暴露到前端。
- 真实物理串口验证：`not-run`，本步不触碰串口。
