# Specification: add-deepseek-provider

## Requirement: AI 配置持久化

Main MUST 维护 `userData/ai-config.json`（provider/enabled/allowDataUpload），提供查看与修改。API Key 不落盘明文。

### Scenario: 配置 provider

- GIVEN 用户选择 provider=deepseek 并启用
- WHEN 保存
- THEN `ai-config.json` 更新为 `{provider:'deepseek', enabled:true, ...}`
- AND API Key 不写入配置文件

## Requirement: API Key 来源

DeepSeek API Key MUST 从环境变量 `DEEPSEEK_API_KEY` 或运行时内存输入读取，不写入代码/配置文件。

### Scenario: 环境变量 Key

- GIVEN 环境变量 `DEEPSEEK_API_KEY` 已设置
- WHEN 调 DeepSeek
- THEN 使用该 Key

### Scenario: 无 Key

- GIVEN 未设置环境变量且未运行时输入 Key
- WHEN 调用 `ai.parseProtocol`
- THEN 回退 C++ mock（不发起 DeepSeek 调用）

## Requirement: 真实调用 vs 回退

`ai.parseProtocol`/`ai.generateCommands` MUST：配置 provider=deepseek + enabled + 有 Key 时调 DeepSeek；否则回退 C++ mock。

### Scenario: 真实调用

- GIVEN provider=deepseek、enabled、`DEEPSEEK_API_KEY` 存在
- WHEN 调用 `ai.parseProtocol({text})`
- THEN 经 DeepSeek API 返回结构化结果

### Scenario: 回退 mock

- GIVEN 未配置 provider=deepseek 或无 Key
- WHEN 调用 `ai.parseProtocol({text})`
- THEN 经 C++ mock 返回（不联网）

## Requirement: 串口数据上传

用户显式启用"包含串口数据"时，`ai.parseProtocol`/`ai.generateCommands` 的输入 MUST 可包含最近 N 条 RX 帧；`allowDataUpload` 为 false 时 MUST 拒绝上传。

### Scenario: 包含串口数据

- GIVEN 用户启用"包含串口数据"且 `allowDataUpload=true`
- WHEN 调用
- THEN 输入含最近 RX 帧

### Scenario: 禁止上传

- GIVEN `allowDataUpload=false`
- WHEN 尝试上传串口数据
- THEN 拒绝，提示需开启上传

## Requirement: 配置窗口

renderer MUST 提供 AI 配置窗口：选择 provider、启用、允许上传、运行时输入 Key（内存）、查看上传风险提示。

### Scenario: 配置与保存

- GIVEN 用户在配置窗口操作
- WHEN 保存
- THEN 持久化 provider/enabled/allowDataUpload（不含 Key）

## Requirement: 错误处理

DeepSeek 调用失败（网络/超时/API 错误）MUST 返回明确 error，不静默回退到 mock（避免误以为真实解析）。

### Scenario: API 失败

- GIVEN DeepSeek API 返回错误或超时
- WHEN 调用
- THEN 返回 error，renderer 显示失败原因
