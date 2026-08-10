# Specification: add-ai-debug-log-and-key-save

## Requirement: DeepSeek 原始回复调试输出

`deepseek-provider.js` MUST 在获取 DeepSeek 原始回复后打印原始文本（调试级），并在 JSON 解析失败时把原始文本纳入错误信息，便于定位畸形输出（如 `Expected ',' or ']' after array element`）。

### Scenario: JSON 解析失败时可见原始文本
- GIVEN DeepSeek 返回畸形 JSON（如数组元素间缺逗号）
- WHEN `extractJson` 抛错
- THEN 错误信息包含原始回复文本（截断至可读长度），且 console 打印完整原文

### Scenario: 正常返回
- GIVEN DeepSeek 返回合法 JSON
- WHEN 解析成功
- THEN 不影响原有返回结构

## Requirement: 支持 0x 十六进制字面量

`extractJson` MUST 支持 DeepSeek 命令生成返回的 `0x` 十六进制数字（如 `[0x05, 0x1F, ...]`），JSON 标准不支持 `0x` 前缀，须归一化为十进制后解析，避免 `Expected ',' or ']' after array element`。

### Scenario: code 数组含 0x 字面量
- GIVEN DeepSeek 返回 `[{"code":[0x05,0x1F]}]`
- WHEN `extractJson` 解析
- THEN 成功返回，`code[0]===5`、`code[1]===31`

### Scenario: 字符串内 0x 不被误改
- GIVEN JSON 字段值含 `"0x1F"` 文字（如说明）
- WHEN `extractJson` 解析
- THEN 字符串字段内容原样保留，仅数组值位置的 0x 被归一化

## Requirement: API Key 可选本地保存

新增 `saveApiKeyToDisk` 配置项。用户显式选择保存时，API Key 写入 `ai-config.json` 并在下次启动读取；否则维持"仅内存态/环境变量"现状，不落盘明文。

### Scenario: 用户选择保存 Key
- GIVEN 用户在配置窗口勾选"保存到本地"并填写 Key
- WHEN 保存
- THEN `ai-config.json` 记录 `saveApiKeyToDisk:true` 与 `savedApiKey`
- AND 下次应用启动 `getApiKey()` 能取回该 Key

### Scenario: 用户不保存 Key
- GIVEN 用户未勾选"保存到本地"
- WHEN 保存
- THEN API Key 仅内存态，`ai-config.json` 不含明文 Key
- AND 重启后需重新输入或使用环境变量

### Scenario: 显式关闭保存
- GIVEN 已保存过 Key 的用户取消勾选"保存到本地"
- WHEN 保存
- THEN 从 `ai-config.json` 移除 `savedApiKey`

### Scenario: 默认不保存
- GIVEN 新安装/无此字段的旧配置
- WHEN 启动
- THEN `saveApiKeyToDisk` 默认为 false，`savedApiKey` 为空

## Requirement: 配置窗口

renderer MUST 在 AI 配置窗口提供"将 API Key 保存到本地"复选框，并在打开时按已持久化状态回显。

### Scenario: 打开配置窗口回显
- GIVEN 曾勾选保存且已持久化 Key
- WHEN 打开配置窗口
- THEN "保存到本地"复选框为勾选状态

## Requirement: 兼容性

已有 `ai-config.json` 缺少新字段时 MUST 正常加载，不抛错，不改变既有行为。
