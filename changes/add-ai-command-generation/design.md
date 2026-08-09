# Design: add-ai-command-generation

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 后端方法 | `ai.generateCommands`，经 `AiAdapter` 门面（未启用抛 not-enabled） | 与 ai.parseProtocol 一致，复用授权边界 |
| IPC 返回 | `[{name, code:[byte], description}]`（JSON 数组） | 对齐 `CommandSpec`；code 为数字数组，前端转 HEX |
| main 白名单 | 加入 `ai.generateCommands` | IPC 第二道闸 |
| 前端落点 | `#page-protocol` 增加命令生成区（复用第 4 步页面） | 规约解析与命令生成同属 AI 配置闭环 |
| 命令→宏映射 | 前端把 code 数组转 HEX 空格分隔字符串，name 作宏名，kind=write，mode=hex，lineEnding=none | 复用既有宏库存储/一键发送/持久化，不改宏结构 |
| 去重 | 加入宏库时若同名宏已存在则覆盖或提示 | 避免重复；采用覆盖（更新 data），与宏编辑保存语义一致 |
| 授权 | 生成区按钮在 AI 未启用时禁用；`ai.generateCommands` 内部仍强制门面校验 | 双层保障 |

## 数据流

```
renderer.js #page-protocol 命令生成区
  → callBackend('ai.generateCommands', {text})   // 经 AiAdapter 门面 → mock → CommandSpec[]
  → 前端渲染命令列表（name/code HEX/description）
  → 用户点"加入宏库" → 转宏对象 → 合并进 state.macros + 持久化
  → 宏库页面可一键发送
```

## Risks

- mock 命令是固定示例，真实命令生成价值待真实 provider（L3）。
- 命令→宏映射假设 code 是完整帧（含校验）；若未来需要动态填参/补校验，宏需支持模板/校验扩展（后续 change）。
- 命令加入宏库是前端本地操作，不经后端；若需校验合法性可在宏保存逻辑复用。
