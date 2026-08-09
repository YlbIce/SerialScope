# Specification: add-ai-provider-adapter

## Requirement: 授权边界

`AiAdapter` MUST 在调用 provider 前强制授权检查。默认 `enabled=false`、`allowDataUpload=false`。

### Scenario: 未启用

- GIVEN 新建 `AiAdapter`，未调用 `configure`
- WHEN 调用 `chat`/`parseProtocol`/`generateCommands`
- THEN 抛出 `AiError`，`code == "not-enabled"`

### Scenario: 启用但禁止上传 + mock

- GIVEN `configure(true, false)` 且 provider 为 `MockAiProvider`
- WHEN 调用任意方法
- THEN 正常返回（mock `requiresDataUpload()==false`）

### Scenario: 启用但禁止上传 + 需上传的 provider

- GIVEN `configure(true, false)` 且 provider 的 `requiresDataUpload()==true`
- WHEN 调用任意方法
- THEN 抛出 `AiError`，`code == "data-upload-denied"`

## Requirement: MockAiProvider 行为

`MockAiProvider` MUST 返回确定、可断言且不联网的结果，`name()` 返回 `"mock"`，`requiresDataUpload()` 返回 false。

### Scenario: chat

- GIVEN `MockAiProvider`
- WHEN `chat("hello")`
- THEN 返回非空 `reply` 且 `modelName=="mock"`
- AND `reply` 包含输入中的关键词（确定性回显）

### Scenario: parseProtocol

- GIVEN `MockAiProvider`
- WHEN `parseProtocol("AA 55 LEN ...")`
- THEN 返回 `ProtocolParseResult`，其中 `frame.header==[0xAA,0x55]`（确定性）
- AND `parseResultCount()>0`（记录调用次数）

### Scenario: generateCommands

- GIVEN `MockAiProvider`
- WHEN `generateCommands(...)`
- THEN 返回非空命令列表，每条含 `name` 与 `code`

## Requirement: Provider 选择

`AiAdapter` MUST 支持按名称选择 provider，未知名称抛出 `AiError`。

### Scenario: 未知 provider

- GIVEN `AiAdapter::setProviderByName("no-such")`
- WHEN 调用
- THEN 抛出 `AiError`，`code == "unknown-provider"`

## Requirement: 无网络行为

本步 MUST 不建立任何网络连接；`MockAiProvider` 不访问任何本地或远程端点。
