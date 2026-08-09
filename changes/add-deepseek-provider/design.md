# Design: add-deepseek-provider

## 架构（G1：方案 A，Node 侧调用）

```
renderer AI 配置窗口 / 规约解析
        │ callBackend('ai.configure'/'ai.parseProtocol'/'ai.generateCommands')
        ▼
Electron Main（ai.* RPC 分发）
        │  判断 provider：deepseek（有 Key + enabled）→ 调 DeepSeek；否则回退 C++ mock
        ├── 真实调用：deepseek-provider.js → DeepSeek HTTPS API（Node 内置 https/fetch，无新依赖）
        └── 回退：backendRpc.call → C++ AiAdapter（mock）
```

## AI 配置（G1：明文，userData JSON）

- 配置文件：`userData/ai-config.json`：`{ provider: 'deepseek'|'mock', enabled: bool, allowDataUpload: bool }`。
- **API Key 不写入配置文件/代码/commit**，优先从环境变量 `DEEPSEEK_API_KEY` 读取；也可运行时在配置窗口输入（内存态，不回写明文）。
- 前端配置窗口：选择 provider、启用 AI、允许上传、输入 Key（仅在运行时内存使用）。

## DeepSeek 调用（Node）

- `deepseek-provider.js` 用 Node 内置 `https`（或 `fetch`）调 DeepSeek Chat Completions API。
- `parseProtocol`/`generateCommands`：构造提示词（复用需求文档中的规约解析/命令生成提示词模板），把规约文本（可选 + 最近 RX 帧）发给 DeepSeek，解析返回的 JSON 为结构化结果。
- 超时、错误处理：调用失败返回明确 error，不静默。

## 上传范围（G1：含串口数据）

- `ai.parseProtocol`/`ai.generateCommands` 的输入可包含规约文本；若启用"包含串口数据"，附加最近 N 条 RX 帧（从 McpBridge/Main RX 缓冲取），用于 AI 结合实际收发的诊断/解析。
- 上传是显式的（`allowDataUpload=true` 才允许，且配置窗口明确提示"数据将发送到 DeepSeek"）。

## 与现有 AiAdapter 的关系

- 保留 C++ `AiAdapter`/`MockAiProvider` 作为**回退**（未配置真实 provider 或无 Key 时）。
- `ai.*` RPC 在 Main 侧增加"真实 provider 优先"判断，真实调用不经过 C++ mock。

## 安全

- API Key 不落盘明文（环境变量/内存）。
- `allowDataUpload` 默认 false；用户显式开启且配置窗口提示上传风险。
- 串口数据上传是用户显式选择（G1 确认）。
- L3 人工闸门：G1 已确认，G2 设计评审，G3 审核。

## Risks

- DeepSeek API 可用性/额度/错误需端到端验证（需真实 Key）。
- 上传规约文本 + 串口数据到云端是永久性数据外泄，用户已授权但应保留提示。
- 提示词质量影响解析准确率（后续可迭代 Few-shot）。
