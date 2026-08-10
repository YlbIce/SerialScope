# Tasks: add-ai-debug-log-and-key-save

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| JSON 解析失败时错误含原始文本 | 单元验证 extractJson | 对畸形 JSON 调 extractJson | 错误不含原文 |
| 正常返回结构不变 | 单元验证 extractJson | 对合法 JSON 调 extractJson | 返回结构变化 |
| code 数组含 0x 字面量可解析 | 单元验证 extractJson | 对 `[{"code":[0x05,0x1F]}]` 调 extractJson | 报 Expected ',' or ']' |
| 字符串内 0x 不被误改 | 单元验证 extractJson | 对含 `"0x1F"` 文字的 JSON 调 extractJson | 字符串被误改 |
| 勾选保存 Key → 持久化到 ai-config.json | 集成测试 | configure({saveApiKeyToDisk:true, apiKey}) 后读文件 | Key 未写入 / 重启读不回 |
| 不勾选 → 不落盘 | 集成测试 | configure({saveApiKeyToDisk:false}) 后读文件 | 明文 Key 被写入 |
| 显式关闭 → 移除已存 Key | 集成测试 | 先存后关再读文件 | 旧 Key 残留 |
| 默认不保存 | 集成测试 | 旧配置/无字段加载 | 默认值非 false |
| 打开配置窗口回显保存选项 | UI 测试 | openAiConfig | 复选框未回显 |
| 兼容旧配置 | 集成测试 | 无新字段的 ai-config.json 加载 | 加载抛错 |

## Checklist

- [x] 创建 change 包文档
- [x] deepseek-provider.js：打印原始回复 + 解析失败含原文
- [x] deepseek-provider.js：extractJson 支持 0x 十六进制归一化（真实根因）
- [x] deepseek-provider.js：callChatCompletions 累积 Buffer 避免分块切断 UTF-8
- [x] ai-config.js：saveApiKeyToDisk 持久化 + savedApiKey 读写
- [x] main.js：ai:config 透传新字段（AiConfig 已处理，无需改 main.js）
- [x] index.html + renderer.js：配置窗口保存选项 UI
- [x] 验证（extractJson 0x / ai-config 集成 / check / process:check / test:ai-rpc）
- [ ] 独立只读审核；不自动归档

## Explicit not-run / blocked

- 真实 DeepSeek 端到端（真实畸形输出）取决于模型返回；本变更验证的是"解析失败时错误信息含原文 + 0x 归一化"的单元/集成层面，不依赖真实网络。
