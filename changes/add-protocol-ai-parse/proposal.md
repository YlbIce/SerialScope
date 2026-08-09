# Proposal: add-protocol-ai-parse

## Why

AI 智能串口调试工具的 F-007~F-011 需求要求：用户输入规约文档 → AI 提取帧头/长度域/字段 → 生成分帧配置 → 用户人工校正确认。第 3 步已建立 `AiAdapter` 门面与 mock provider，但尚未暴露到 IPC 与前端。本步打通端到端链路：后端注册 `ai.*` JSON-RPC 方法（经 `AiAdapter` 授权门面），前端新增"规约解析 + 人工校正"页面。

## What

- 后端 `NamedPipeServer` 注册 `ai.status` / `ai.configure` / `ai.parseProtocol`，全部经 `AiAdapter` 门面授权（`enabled` 与 `allowDataUpload`）。
- main 进程 `allowedRpcMethods` 白名单加入 `ai.status` / `ai.configure` / `ai.parseProtocol`。
- 前端原生渲染器新增 `#page-protocol` 页面：规约文本输入 → `ai.parseProtocol` → 结构化结果展示（帧头/长度域/字段）→ 可编辑校正 → 导出 JSON。

## Non-goals

- 不实现真实网络 AI provider（仍用第 3 步的 mock，不联网、无真实上传）。
- 不接入真实串口数据自动解析（本步只做规约文本 → 配置的人工校正流程）。
- 不实现命令生成 UI / AI 对话 UI（后续 change）。
- 不改现有串口 RPC 契约。

## Acceptance

1. `ai.status` 返回当前 `enabled`/`allowDataUpload`/`provider`。
2. `ai.configure({enabled, allowDataUpload})` 可切换授权状态；`ai.parseProtocol` 仅在 `enabled=true` 时返回 mock 解析结果，否则返回 JSON-RPC error。
3. main 白名单只放行 `ai.status`/`ai.configure`/`ai.parseProtocol`，其他 `ai.*` 仍被拒绝。
4. 前端 `#page-protocol` 页面可输入规约文本、触发解析、展示并可编辑校正结果、导出 JSON；校正后的字段可保存到 localStorage。
5. mock 不联网；`allowDataUpload` 保持默认 false。
6. C++ 构建、`npm run check`、`npm run process:check` 通过；native AI 适配测试无回归。

## Risk tier

`L2` — 暴露 `ai.*` IPC 方法与前端规约校正 UI；mock provider 不联网、不改变串口数据上传边界（`allowDataUpload` 默认 false）。若后续接入真实网络 provider 并允许上传，必须升级为 L3 并取得显式授权。`ai.configure` 是启用 AI 的入口，必须经 `AiAdapter` 门面校验，不能绕过。
