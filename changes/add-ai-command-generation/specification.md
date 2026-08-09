# Specification: add-ai-command-generation

## Requirement: ai.generateCommands 授权

`ai.generateCommands` MUST 仅在 `enabled=true` 时返回命令列表；否则返回 JSON-RPC error。

### Scenario: 未启用被拒

- GIVEN 未调用 `ai.configure({enabled:true})`
- WHEN 调用 `ai.generateCommands({text:"..."})`
- THEN 返回 JSON-RPC error，message 含 `not-enabled`

### Scenario: 启用后生成

- GIVEN `ai.configure({enabled:true})`
- WHEN 调用 `ai.generateCommands({text:"AA 55 ..."})`
- THEN 返回数组，含 `{name:"ReadDeviceInfo", code:[0xAA,0x55,0x01], description:"mock read device info"}`（mock 确定性）

## Requirement: main 白名单

main 进程 `allowedRpcMethods` MUST 放行 `ai.generateCommands`；其他未列 `ai.*` 仍被 main 拒绝。

### Scenario: 未列入被拒

- GIVEN 前端调用 `callBackend('ai.chat', {...})`
- THEN main 抛"不允许的后端 RPC 方法"

## Requirement: 前端命令生成区

`#page-protocol` 命令生成区 MUST 展示生成的命令列表（名称/HEX 数据/描述），每条命令可"加入宏库"。

### Scenario: 生成并展示

- GIVEN AI 已启用，命令生成区可见
- WHEN 点击"生成命令"
- THEN 显示命令列表，每条含 `name` 与 HEX 数据（code 数组转 HEX 字符串）

### Scenario: 加入宏库

- GIVEN 命令列表已展示
- WHEN 点击某命令的"加入宏库"
- THEN 宏库新增一条宏（name=命令名，mode=hex，data=HEX 字符串）
- AND 宏库页面可见并可一键发送

## Requirement: 无上传

本步 mock 不建立任何网络连接；`allowDataUpload` 默认 false。
