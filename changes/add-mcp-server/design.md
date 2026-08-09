# Design: add-mcp-server

## 架构：MCP 子进程 → Electron Main → C++ 后端

```
Claude Desktop / Cursor (MCP 客户端)
        │  stdio（JSON-RPC 2.0，MCP 协议）
        ▼
MCP Server 进程（Node 子进程，由 Electron Main 派生）
        │  IPC（受限，仅转发 MCP 工具调用）
        ▼
Electron Main（唯一后端 RPC 客户端，持 Named Pipe）
        │  复用 allowedRpcMethods 白名单 + 端口白名单 + 授权门面
        ▼
C++ 后端（Named Pipe JSON-RPC）
```

**选择理由**：
- MCP 客户端通过 stdio 与 MCP 子进程交互（G1 决策）。
- MCP 子进程不直接持有后端 Named Pipe 连接，而是经 Electron Main 转发，**复用现有单客户端 + Owner SID DACL + allowedRpcMethods 白名单**安全模型，不破坏封闭边界。
- 端口白名单在 Main 侧强制，MCP 子进程无法绕过。

## 传输与协议

- MCP stdio：子进程 stdin/stdout 收发 `JSON-RPC 2.0` 消息（MCP 规范：`initialize`、`tools/list`、`tools/call`）。
- 每行一条 JSON（MCP stdio 用换行分隔）。
- 支持 MCP 握手与工具发现。

## 工具暴露与授权

| 工具 | 读/写 | 授权要求 |
| --- | --- | --- |
| `list_ports` | 读 | 无（复用 ports.list） |
| `serial.status` | 读 | 无 |
| `read_data` | 读 | 端口在授权集合内 |
| `open_connection` | 写 | 端口在授权集合内 + 参数校验 |
| `send_data` | 写 | 端口在授权集合内 + **每次确认（人机闸门）** |
| `send_and_expect` | 写 | 端口在授权集合内 + **每次确认** |
| `configure_connection` | 写 | 端口在授权集合内 |

## 授权模型（端口白名单 + 复用门面）

1. **端口白名单**：Main 维护 `serialscope.mcp.allowPorts`（配置/持久化），MCP 只可操作白名单内的端口。
2. **复用后端授权门面**：所有转发经现有 `backendRpc.call`（allowedRpcMethods 白名单）；串口写操作（open/send）必须目标端口在白名单内。
3. **写确认模式（G1 决策：端口白名单授权后即放行）**：白名单内端口的 `send_data`/`send_and_expect` 不再逐次确认，直接放行。保留可配置的"确认模式"（future：如需逐次确认可切换）。
4. **启动开关（G1 决策：默认关闭）**：MCP Server 默认不启动，需用户在 Electron 中显式启动。避免默认向外部进程开放。
5. **MCP 进程权限**：MCP 子进程是受限转发器，无独立后端凭据，仅经 Main 转发。

## read_data 语义（G1 决策）

`read_data` 不阻塞读，而是返回当前会话最近 N 条 RX 帧快照（从 Main 维护的日志/接收缓冲读取）。`N` 由参数指定（默认最近 10 条）。不提供持续监听（如需流式可后续扩展 notification）。

## 验证边界

- 用 **COM10/COM11 虚拟串口对**做端到端验证（G1 决策）：MCP 客户端 → MCP server → Main → 后端 → COM10，COM11 侧读回。
- 真实物理设备不涉及（虚拟串口对为 ELTIMA）。
- 授权拒绝场景：白名单外端口、未确认写操作。

## Risks

- MCP stdio 子进程与 Main 的 IPC 通道本身需限制（仅暴露 MCP 工具映射，不暴露任意 RPC）。
- 每次写确认是可用性与安全的平衡；若用户要求批量自动化可后续提供"授权一次/授权端口"增强。
- MCP 客户端（Claude Desktop/Cursor）本身是第三方进程，其权限模型不可控；因此 Main 侧授权门面必须独立于 MCP 客户端可信度。
