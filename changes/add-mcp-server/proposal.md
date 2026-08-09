# Proposal: add-mcp-server

## Why

AI 智能串口调试工具的需求文档要求可选支持 MCP（Model Context Protocol），使 Claude Desktop、Cursor 等 MCP 客户端可操控串口。这能显著增强 AI 与设备联调能力。

## Why L3

MCP Server 将串口能力暴露给**外部进程**（第三方 AI 客户端），突破当前 Electron Main 内单一 RPC 白名单的封闭边界，属于 AGENTS.md 定义的"改变默认安全边界"。且 `send_data` 等写工具若接真实设备可能造成物理影响。因此本变更按 L3 处理：完整生命周期、Mode P、人工闸门，不自动推进、不自动归档。

## What（待方案确认后细化）

在仓库新增 MCP Server，暴露受限串口工具。候选实现位置：独立 Node 进程（stdio 传输）通过受控通道转发到现有 C++ 后端。

## 安全边界（必须在开始前由用户确认）

1. **传输**：stdio（MCP 客户端通过子进程标准输入/输出交互）vs SSE/HTTP。
2. **工具暴露清单**：
   - 只读工具：`list_ports`、`serial.status`、`read_data`
   - 写工具：`open_connection`、`send_data`、`send_and_expect`、`configure_connection`
   - **是否暴露写工具、是否默认拒绝**是核心安全决策。
3. **授权模型**：
   - 端口白名单（仅允许列出的端口）
   - 每次写入是否需用户确认（人机闸门）
   - 是否复用现有 AiAdapter/后端授权门面
4. **真实设备**：无授权前不接真实物理串口；验证用模拟器或受限端口。
5. **依赖**：引入 `@modelcontextprotocol/sdk` 或自研 stdio JSON-RPC 最小实现；引入依赖需许可证审查。

## Non-goals

- 不在本步接入真实物理串口写操作（除非用户明确授权并给设备参数）。
- 不替代现有 Named Pipe IPC 授权边界。
- 不暴露命令生成/规约解析等 AI 内部能力（除非需求明确）。

## 人工闸门（L3）

- G1：本 proposal 与安全边界设计获用户确认。
- G2：design 与 specification 评审通过。
- G3：实现与验证完成后独立审核 approved 才可考虑接真实设备。
- 归档必须用户确认。

## Risk tier

`L3` — 改变默认安全边界，向外部进程暴露串口能力；涉及真实设备写入与权限升级。全程 Mode P，人工闸门。
