# Proposal: add-ai-command-generation

## Why

AI 智能串口调试工具的 F-012~F-015 需求要求：AI 根据规约自动生成读写命令列表、支持自然语言生成特定命令、命令关联响应、保存为命令集复用。第 4 步已打通 `ai.parseProtocol` 链路与 mock `AiProvider`。本步把 mock 的 `generateCommands` 暴露到 IPC 与前端，并将生成结果映射到既有宏库（复用命令保存/一键发送能力）。

## What

- 后端 `NamedPipeServer` 注册 `ai.generateCommands` JSON-RPC 方法，经 `AiAdapter` 门面授权（未启用抛 not-enabled）。
- main 进程 `allowedRpcMethods` 白名单加入 `ai.generateCommands`。
- 前端 `#page-protocol` 增加"命令生成"区：触发 `ai.generateCommands`，展示生成的命令列表（名称/HEX 数据/描述），每条命令可"加入宏库"复用。
- 命令 → 宏映射：命令 `code`（字节数组）转 HEX 字符串，`name` 作宏名，kind 默认 `write`。

## Non-goals

- 不实现真实网络 AI provider（仍用 mock，不联网）。
- 不实现命令响应模板关联 / 参数化（F-014 留待后续）。
- 不实现自然语言生成特定命令（F-013 需真实 provider，后续 L3）。
- 不改变宏库现有行为与存储格式。

## Acceptance

1. `ai.generateCommands` 未启用时返回 not-enabled error；启用后返回 mock 确定性命令列表（含 name/code/description）。
2. main 白名单放行 `ai.generateCommands`，其他未列方法仍被拒。
3. 前端命令生成区可展示命令列表，每条命令"加入宏库"后可在宏库页面看到并可一键发送。
4. mock 不联网；`allowDataUpload` 默认 false。
5. C++ 构建、`npm run check`、`npm run process:check` 通过；native AI 测试无回归。

## Risk tier

`L2` — 暴露 `ai.generateCommands` 到 IPC 与前端，复用宏库做命令复用；mock 不联网、不改数据上传边界。真实网络命令生成（F-013）需后续 L3 授权。
