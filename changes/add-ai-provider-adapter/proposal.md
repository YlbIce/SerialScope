# Proposal: add-ai-provider-adapter

## Why

AI 智能串口调试工具的 F-007~F-013/F-024 需求要求 AI 辅助规约解析、命令生成、自然语言交互。当前后端没有任何 AI 集成点。为避免"一次性把串口数据联网上传"的安全风险（NF-005），本步先建立 **AI 适配层接口契约与可插拔 provider 框架**，并仅提供一个**本地 mock provider**（不联网），把真实网络 provider（Ollama/DeepSeek API）留作后续单独授权的 L3 change。

## What

新增 C++ 后端 AI 适配层：

- `AiProvider` 抽象接口：`chat`、`parseProtocol`、`generateCommands`、`name()`、`requiresDataUpload()`。
- `AiAdapter` 门面：持有 provider、管理 `ai:enabled` 授权开关与 `allowDataUpload` 标记、路由调用。
- `MockAiProvider`：本地确定性实现（不联网），用于单元测试与后续 IPC 接线的可复现验证。
- 请求/响应结构化模型：`AiChatRequest/Response`、`ProtocolParseResult`、`CommandSpec`。
- 默认配置：`ai.enabled=false`、`ai.allowDataUpload=false`。

## Non-goals

- 不接入 Named Pipe JSON-RPC 方法（本步不暴露 `ai.*` 到前端，避免未经授权触发 AI 调用）。
- 不实现真实 HTTP/网络 provider（Ollama/DeepSeek），真实联网上传由后续 L3 change 单独评估授权。
- 不改变串口数据默认上传边界：本步默认无任何数据离开本机。
- 不实现提示词工程 / RAG / 规约知识库。

## Acceptance

1. `AiAdapter` 在 `enabled=false` 时任何调用返回"未启用"错误；`enabled=true` 且 `allowDataUpload=false` 时，调用 `requiresDataUpload()` 为 true 的 provider 方法被拒绝。
2. `MockAiProvider` 的 `chat`/`parseProtocol`/`generateCommands` 返回确定且可断言的本地结果，`requiresDataUpload()` 返回 false。
3. 接口签名与请求/响应模型完整，可通过 `fromName` 选择 provider。
4. C++ 构建与 native tests 通过；`npm run check`、`npm run process:check` 通过。
5. 不引入任何网络库依赖；本步无可观察的网络行为。

## Risk tier

`L2` — 新增后端 AI 适配接口库与本地 mock provider 及测试，改变可观察的 AI 适配能力，但**默认不联网、不改串口数据上传边界、不接入 IPC**。若后续接入真实网络 provider 并允许串口数据上传，必须升级为 L3 并取得用户显式授权。
