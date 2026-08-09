# Specification: add-mcp-server

## Requirement: MCP stdio 传输

MCP Server 作为独立 Node 子进程，通过 stdin/stdout 以 MCP 协议（JSON-RPC 2.0，每行一条 JSON）与客户端交互。

### Scenario: 握手

- GIVEN MCP 子进程启动
- WHEN 客户端发送 `initialize`（MCP 协议）
- THEN 返回 `serverInfo` 与支持能力（tools）
- AND 后续客户端发送 `tools/list` 返回工具清单

## Requirement: 启动开关（默认关闭）

MCP Server MUST 默认不启动；用户 MUST 在 Electron 中显式启动后才派生 MCP 子进程。

### Scenario: 默认关闭

- GIVEN Electron 应用启动
- THEN MCP 子进程未创建，无外部进程可连

### Scenario: 显式启动

- GIVEN 用户点击"启动 MCP Server"
- THEN Main 派生 MCP 子进程，绑定 stdio 通道

## Requirement: 工具暴露与授权

MCP Server MUST 暴露以下工具，且所有串口操作经 Main 复用 `allowedRpcMethods` 白名单 + 端口白名单授权：

- `list_ports`（读）：复用 `ports.list`
- `serial.status`（读）：复用 `serial.status`
- `read_data`（读）：返回最近 N 条 RX 帧快照
- `open_connection`（写）：目标端口必须在白名单
- `send_data`（写）：目标端口必须在白名单（白名单授权后即放行，不逐次确认）
- `send_and_expect`（写）：目标端口必须在白名单
- `configure_connection`（写）：目标端口必须在白名单

### Scenario: 白名单内端口写操作放行

- GIVEN 端口 `COM10` 在白名单 `serialscope.mcp.allowPorts`
- WHEN 调用 `send_data({port:"COM10", data:[...]})`
- THEN 转发到后端 `serial.send`，成功返回

### Scenario: 白名单外端口被拒

- GIVEN 端口 `COM5` 不在白名单
- WHEN 调用 `send_data({port:"COM5", ...})`
- THEN 返回 MCP error，拒绝且不转发到后端

## Requirement: 端口白名单管理

Main MUST 维护 `serialscope.mcp.allowPorts`（持久化配置），提供查看与增删。

### Scenario: 增删端口

- GIVEN 用户通过配置加入 `COM10`
- THEN 白名单含 `COM10`，MCP 可操作该端口
- AND 移除后 MCP 对该端口操作被拒

## Requirement: read_data 快照

`read_data` MUST 返回当前会话最近 N 条 RX 帧快照（来自 Main 日志缓冲），不阻塞读、不持续监听。

### Scenario: 最近 N 条

- GIVEN 会话已有 RX 帧（经 `serial.rx` 通知累积到 Main 缓冲）
- WHEN 调用 `read_data({count:5})`
- THEN 返回最近 5 条 RX 帧（hex/text）

## Requirement: MCP 子进程受限

MCP 子进程 MUST 无独立后端凭据，仅经 Main 的受限 IPC 转发；Main 侧 IPC 只接受 MCP 工具映射，不接受任意 RPC。

### Scenario: 任意 RPC 拒绝

- GIVEN MCP 子进程
- WHEN 尝试通过其 IPC 通道调用白名单外方法
- THEN 被 Main 拒绝

## Requirement: 验证边界（COM10/COM11）

MCP 端到端验证 MUST 使用 COM10/COM11 虚拟串口对；真实物理设备 not-run。

### Scenario: 端到端

- GIVEN COM10/COM11 虚拟串口对，COM10 在白名单
- WHEN MCP 客户端经 `send_data` 向 COM10 发送 `AA 55`
- THEN COM11 侧读到 `AA 55`
- AND `read_data` 返回对应 RX 帧

## Requirement: 无上传

MCP 传输为本地 stdio，不涉及云端上传；串口数据仅在本机 MCP 客户端与后端间传递。
