# Design: add-ai-debug-log-and-key-save

## 1. DeepSeek 原始回复调试输出

### 问题
`extractJson(text)` 在 `JSON.parse(jsonText)` 失败时只抛 `DeepSeek 返回 JSON 解析失败: ${error.message}`，错误信息（如 `Expected ',' or ']' after array element in JSON at position 50`）不足以定位模型输出内容。

### 方案
- `callChatCompletions` 在拿到 `data`（原始回复）时，用 `console.debug('[DeepSeek] 原始回复:', data)` 打印完整原始文本流（调试级别，`DEBUG_DEEPSEEK!=0` 时，生产不阻塞）。
- `extractJson` 在 `JSON.parse` 失败时，把原始文本（截断到合理长度，如 1000 字符，避免错误信息过长）写入错误信息，同时 `console.error` 打印完整原文。
- `callChatCompletions` 改为累积 `Buffer`（chunks 数组）最后一次性 `Buffer.concat(...).toString('utf8')`，避免分块边界切断 UTF-8 多字节字符被 `chunk.toString('utf8')` 解码为 U+FFFD。

### 根因：0x 十六进制字面量
DeepSeek 命令生成的 `code` 数组返回 `[0x05, 0x1F, 0x10, 0x80]` 十六进制写法。JSON 标准不支持 `0x` 前缀，`JSON.parse` 遇到 `0x05` 时把 `0` 当数字、遇 `x` 报 `Expected ',' or ']' after array element`（与用户实测错误一致）。

修复：`extractJson` 首轮解析失败后，调用新增 `normalizeHexNumbers(jsonText)`——逐字符扫描，仅把**字符串之外**的 `0x[0-9a-fA-F]+` 归一化为十进制，再用 `JSON.parse` 重试；字符串字段内的 `0x...`（如 description 里的说明文字）不被误改。

## 2. API Key 可选本地保存

### 当前状态
`AiConfig`：
- 持久化字段仅 `provider` / `enabled` / `allowDataUpload`。
- `apiKey` 仅内存态 `runtimeApiKey` 或环境变量 `DEEPSEEK_API_KEY`，不明文落盘。

### 改动
- 新增持久化字段 `saveApiKeyToDisk: boolean`（默认 `false`，即不保存，维持现状）。
- 新增持久化字段 `savedApiKey: string`（仅当用户选择保存时写入）。
- `_load()`：读取 `saveApiKeyToDisk` 与 `savedApiKey`。
- `_persist()`：当 `saveApiKeyToDisk` 为 true 时写入 `savedApiKey`；为 false 时从文件中移除 `savedApiKey`（不残留明文）。
- `configure({ provider, enabled, allowDataUpload, apiKey, saveApiKeyToDisk })`：
  - 若 `saveApiKeyToDisk === true` 且提供了 `apiKey`，则持久化 `savedApiKey`，同时设内存态。
  - 若 `saveApiKeyToDisk === false`（显式关闭），清除 `savedApiKey`，apiKey 仅保留内存态。
  - 未显式指定 `saveApiKeyToDisk` 时沿用原值。
- `getApiKey()` 优先级：`runtimeApiKey` → `savedApiKey` → 环境变量。
- `getSnapshot()` 增加 `saveApiKeyToDisk`、`hasPersistedApiKey` 字段（渲染进程据此回显复选框，不回传明文 Key）。

## 3. 主进程分发（main.js）

- `ai:config` handler 的 `configure`/`getSnapshot` 直接透传新字段（`AiConfig` 已处理），无需额外逻辑。
- `ai:test` 不变：优先输入框临时 Key，其次已配置 Key（含持久化 Key），再环境变量。

## 4. 前端配置窗口（index.html + renderer.js）

- `index.html`：在 API Key 输入框下方新增复选框 `aiSaveKeyCheck`（"将 API Key 保存到本地（下次启动自动读取）"），并附简短说明文字（提示本地文件路径与明文风险）。
- `renderer.js`：
  - `openAiConfig()`：读取 `getAiConfig()` snapshot，若 `hasPersistedApiKey` 为 true 则勾选 `aiSaveKeyCheck`；否则不勾选。
  - `saveAiConfig()`：读取 `aiSaveKeyCheck.checked`，传入 `configureAi({ ..., saveApiKeyToDisk })`。
  - `showToast` 中提示 Key 是否已本地保存。

## 5. 安全与兼容

- 保存 Key 为**用户显式选择**，默认不保存（`saveApiKeyToDisk` 默认 false），不改变既有"不明文落盘"默认边界。
- 已有 `ai-config.json`（无新字段）可正常读取（字段缺失时取默认值）。
- 错误信息中打印原始文本仅用于调试定位；console.debug 级别，不影响 UI。
