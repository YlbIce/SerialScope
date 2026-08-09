# Specification: add-protocol-ai-parse

## Requirement: ai.status

`ai.status` MUST 返回 `{ enabled, allowDataUpload, provider }`，反映 `AiAdapter` 当前配置。

### Scenario: 默认状态

- GIVEN 后端刚启动，未调用 `ai.configure`
- WHEN 调用 `ai.status`
- THEN 返回 `enabled=false`、`allowDataUpload=false`、`provider="mock"`

## Requirement: ai.configure

`ai.configure` MUST 可切换 `enabled` 与 `allowDataUpload`；未提供的字段保持原值。

### Scenario: 启用 AI

- GIVEN 调用 `ai.configure({enabled:true})`
- WHEN 调用 `ai.status`
- THEN `enabled=true`、`allowDataUpload=false`（未变）

## Requirement: ai.parseProtocol 授权

`ai.parseProtocol` MUST 仅在 `enabled=true` 时返回解析结果；否则返回 JSON-RPC error。

### Scenario: 未启用被拒

- GIVEN 未调用 `ai.configure({enabled:true})`
- WHEN 调用 `ai.parseProtocol({text:"..."})`
- THEN 返回 JSON-RPC error，message 含 `not-enabled`

### Scenario: 启用后解析

- GIVEN `ai.configure({enabled:true})`
- WHEN 调用 `ai.parseProtocol({text:"AA 55 LEN ..."})`
- THEN 返回 `{ header: [0xAA,0x55], lengthFieldOffset:2, lengthFieldSize:1, fields:[{name:"command",offset:2,size:1},{name:"payload",offset:3,size:0}] }`（mock 确定性）

## Requirement: main 白名单

main 进程 `allowedRpcMethods` MUST 放行 `ai.status`/`ai.configure`/`ai.parseProtocol`，其他 `ai.*`（如 `ai.chat`）仍被 main 拒绝。

### Scenario: 未列入被拒

- GIVEN 前端调用 `callBackend('ai.chat', {...})`
- THEN main 抛"不允许的后端 RPC 方法"

## Requirement: 前端校正 UI

`#page-protocol` 页面 MUST 允许输入规约文本、触发 `ai.parseProtocol`、展示可编辑的帧头/长度域/字段表，并把校正后的结果保存到 localStorage 与导出 JSON。

### Scenario: 校正与保存

- GIVEN 页面已获取 mock 解析结果
- WHEN 用户修改字段 name/offset/size 并保存
- THEN localStorage `serialscope.protocol` 更新为校正后对象
- AND 导出按钮生成包含校正结果的 JSON 文件

## Requirement: 无上传

本步 mock 不建立任何网络连接；`allowDataUpload` 默认 false。
