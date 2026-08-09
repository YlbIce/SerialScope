# Proposal: add-deepseek-provider

## Why

用户需求：配置 DeepSeek API Key，使 AI 规约解析/命令生成调用真实 DeepSeek 模型（而非本地 mock）。用户已确认：provider=DeepSeek、API Key 明文存储、允许上传数据。

## Why L3

接入真实网络 provider 意味着**规约文本/AI 数据上传到云端**（DeepSeek API），改变"串口数据不上传"的默认安全边界，属于 AGENTS.md 的 L3。全程 Mode P，人工闸门，不自动推进。

## What

- 新增 DeepSeek provider 调用（真实 HTTP/HTTPS 调用 DeepSeek API）。
- AI 配置（API Key、provider 选择、enabled、allowDataUpload）持久化。
- `ai.parseProtocol`/`ai.generateCommands` 在配置真实 provider 时调用 DeepSeek，否则回退 mock。
- 前端 AI 配置窗口（输入 DeepSeek API Key，默认不填 = 用 mock）。

## 技术方案（需用户确认）

**关键决策：DeepSeek HTTP 调用放哪一层？**

- **方案 A（Node 侧调用，推荐）**：DeepSeek 调用在 Electron Main（Node 内置 `https`/`fetch`，无新依赖）。`ai.*` RPC 在 Main 侧判断：配置了真实 provider 则调 DeepSeek，否则回退 C++ mock。改动集中在 Main + renderer。
- **方案 B（C++ 后端调用）**：在 C++ 后端新增 HTTP/HTTPS 客户端（libcurl 或 Boost.Beast+OpenSSL），新增依赖 + vcpkg 构建。改动大、依赖审查成本高。

**推荐方案 A**：避免新增 C++ 网络依赖，复用 Node 内置 HTTPS，更轻量安全。

## 需用户确认

1. **技术方案**：方案 A（Node 调用）还是 B（C++ 调用）？
2. **API Key 明文存储位置**：Electron `userData` JSON 文件（与 MCP 白名单一致）？
3. **上传范围**：仅规约文本？是否包含串口 RX 数据（若 AI 诊断需要）？
4. **真实调用测试**：是否提供可用的 DeepSeek API Key 用于端到端验证？（无 Key 时只能验证配置 UI 与 mock 回退）

## Non-goals

- 不把 mock 替换（保留 mock 作为未配置 Key 的回退）。
- 不做本地模型（Ollama）——用户指定 DeepSeek。
- 不涉及真实串口数据自动上传（除非明确 AI 诊断需 RX 数据）。

## Risk tier

`L3` — 真实网络调用 + 数据上传，改变默认安全边界。Mode P，人工闸门（G1 方案确认 → G2 设计评审 → 实现 → G3 审核 → 归档需确认）。
