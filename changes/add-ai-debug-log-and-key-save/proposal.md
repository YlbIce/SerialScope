# Proposal: add-ai-debug-log-and-key-save

## Why

1. 用户在使用"生成命令"时遇到错误：`DeepSeek 返回 JSON 解析失败: Expected ',' or ']' after array element in JSON at position 50`。当前 `extractJson` 在 `JSON.parse` 失败时只抛出 `JSON.parse` 的错误信息，没有打印/暴露 DeepSeek 返回的**原始文本**，无法定位模型输出为何畸形。需要增加打印 DeepSeek 回复的原始文本流，便于调试。
2. 当前 `AiConfig` 将 API Key 仅保存在内存态（runtime）或从环境变量读取，**不落盘明文**。用户需要一个可选项：是否将 API Key 保存到本地，选是则保存到本地配置文件，下次应用启动时自动从配置文件获取；否则维持内存态。

## Why L2

- 变更涉及可观察行为（DeepSeek 响应调试输出）与配置持久化契约（新增 `saveApiKeyToDisk` 配置项、API Key 可写入 `ai-config.json`），属于 AGENTS.md 的 L2。
- 不涉及真实串口设备写入、安全/权限边界改变（用户主动选择保存 Key 属于用户授权）、发布或迁移，故不需要 L3 的人工闸门全流程。
- 采用 Mode S（实施者写入、审核者只读）。

## What

- `deepseek-provider.js`：
  - 增加打印 DeepSeek 回复原始文本流（console.debug 记录，且 JSON 解析失败时把原始文本一并写入错误信息），便于定位 `Expected ',' or ']' after array element` 这类畸形输出。
  - **根因修复**：DeepSeek 命令生成的 `code` 数组返回 `[0x05, 0x1F, ...]` 十六进制字面量，JSON 标准不支持 `0x` 前缀，导致 `JSON.parse` 报 `Expected ',' or ']' after array element`。`extractJson` 增加 `normalizeHexNumbers`，把字符串外的 `0x` 十六进制归一化为十进制后再解析。
  - `callChatCompletions` 改为累积 Buffer 最后一次性 UTF-8 解码，避免分块边界切断多字节字符产生 U+FFFD。
- `ai-config.js`：新增 `saveApiKeyToDisk` 配置项（持久化）。当用户选择保存时，API Key 写入 `ai-config.json`，下次启动 `_load` 时读取；否则维持当前"仅内存态"行为。
- `main.js`：`ai:config` 的 configure/getSnapshot 支持 `saveApiKeyToDisk` 与持久化 Key 的读写。
- `index.html` + `renderer.js`：AI 配置窗口新增"将 API Key 保存到本地"选项；`saveAiConfig` 读取该选项并传给 `configureAi`。

## Non-goals

- 不改变 DeepSeek 调用逻辑、提示词、模型选择。
- 不改变 `ai.parseProtocol`/`ai.generateCommands` 的对外返回结构。
- 不自动保存 Key——必须是用户显式勾选"保存到本地"。

## Risk tier

`L2` — 可观察行为 + 配置持久化契约变化，但不涉及真实设备写入。Mode S，先场景映射，完成实现后进入 ready-for-review 由独立只读审核。
