# Design: add-protocol-ai-parse

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 后端状态 | `NamedPipeServer` 新增 `std::shared_ptr<ai::AiAdapter>` 成员，构造时创建（默认 enabled=false） | 复用第 3 步门面，集中授权边界 |
| IPC 方法 | `ai.status` / `ai.configure` / `ai.parseProtocol` 三个方法 | 覆盖启用/查询/解析最小闭环；不暴露聊天/命令生成（后续 change） |
| 授权强制 | `ai.parseProtocol` 调 `adapter_.parseProtocol`，内部 `ensureAuthorized` 抛 `not-enabled`；`dispatchSingle` 捕获后返回 JSON-RPC error(-32000) | 前端无法绕过门面 |
| `ai.configure` 语义 | `{enabled?:bool, allowDataUpload?:bool}`，默认不改变未提供字段 | 只启用 mock（不需上传）时用户置 enabled=true |
| main 白名单 | `allowedRpcMethods` 加入 `ai.status`/`ai.configure`/`ai.parseProtocol` | 白名单是 IPC 层第二道闸，未列入的 `ai.*` 仍被 main 拒绝 |
| 前端页面 | 原生渲染器新增 `#page-protocol`，`renderer.js` 的 `switchPage` 支持；侧栏/菜单提供入口 | 主串口调试界面是原生渲染器，规约校正贴近"协议与规则"页 |
| 校正模型 | 展示 `ProtocolParseResult`（header 十六进制/长度域偏移与宽/字段表）；每字段可编辑 name/offset/size；保存到 localStorage `serialscope.protocol` | 复用本地持久化模式（同 rules/macros） |
| 导出 | 校正后结果 `JSON.stringify` 导出为 `.json`（复用 `file:saveText`） | 与现有导出一致 |

## 数据流

```
renderer.js #page-protocol
  → callBackend('ai.configure', {enabled:true})      // 用户显式启用 AI（mock，不需上传）
  → callBackend('ai.parseProtocol', {text})           // 后端经 AiAdapter 门面 → mock → ProtocolParseResult
  → 渲染结构化为可编辑表格 → 用户校正 → 保存/导出 JSON
```

## 安全

- `allowDataUpload` 默认 false；mock `requiresDataUpload()==false`，故启用 mock 不需上传，`ai.parseProtocol` 在 `enabled=true, allowDataUpload=false` 下即可工作。
- 未来接入真实网络 provider 时，其 `requiresDataUpload()==true`，必须 `allowDataUpload=true` 才能调用——强制用户显式授权，且该授权应升级为 L3 流程。
- `ai.configure` 不自动置 allowDataUpload=true；前端 UI 默认不提供"启用上传"入口（真实 provider 阶段再引入）。

## Risks

- 本步解析能力仍为 mock 输出，真实协议解析价值待真实 provider 接入（L3）。
- 前端 UI 为原生 JS 新增页面，与既有 dock/页面切换需保持一致；回归由 `npm run check` 与 UI smoke 覆盖。
- 若 `ai.configure` 被滥用为 enabled=true 而 mock 不产生网络，无上传风险；但接入真实 provider 前须重新审计该入口。
