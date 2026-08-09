# Tasks: add-ai-command-generation

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| ai.generateCommands 未启用被拒 | AI RPC 集成测试 | `npm run test:ai-rpc`（扩展 ai.generateCommands 场景） | 未返回 not-enabled |
| 启用后生成 mock 命令 | 同上 | 启用后调用 | 命令列表不符 |
| main 白名单放行 | RPC 白名单检查 | `ai.chat` 被 main 拒 | 未抛"不允许" |
| 前端命令生成区展示 | Protocol AI UI 测试 | `npm run test:protocol-ai-ui`（扩展生成+加入宏库） | 未展示/未入宏库 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| 既有 native 无回归 | native tests | ai/checksum/frame-decoder tests | 断言失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |
| JS 语法 | syntax check | `npm run check` | 语法失败 |

## Checklist

- [x] 创建 change 包文档
- [x] RED：确认后端无 ai.generateCommands
- [x] 后端 `NamedPipeServer` 注册 ai.generateCommands
- [x] main.js 白名单加入 ai.generateCommands
- [x] 前端 renderer.js 命令生成区 + 加入宏库
- [x] 扩展 test-ai-rpc / test-protocol-ai-ui
- [x] 运行 build/native tests/check/process:check 并写 evidence
- [x] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 真实网络 AI provider / 自然语言生成特定命令：`not-run`，属后续 L3。
- 命令响应模板关联（F-014）：`not-run`，后续 change。
- 真实物理串口验证：`not-run`，本步不触碰串口。
