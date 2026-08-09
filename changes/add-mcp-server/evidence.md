# Evidence: add-mcp-server

```json
{
  "change": "add-mcp-server",
  "riskTier": "L3",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 package.json 与 node_modules",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认仓库无 MCP SDK 依赖、无既有 MCP 实现",
      "doesNotProve": "MCP Server 的目标行为"
    }
  ],
  "verification": [
    {
      "command": "MCP stdio 握手与 tools/list 集成测试",
      "kind": "integration-test",
      "status": "not-run",
      "purpose": "验证 MCP 子进程 initialize/tools/list 握手",
      "doesNotProve": "串口工具授权行为",
      "reason": "尚未实现，G2 评审后实施"
    },
    {
      "command": "COM10/COM11 虚拟串口对端到端（send_data/read_data/open_connection）",
      "kind": "virtual-serial-integration",
      "status": "not-run",
      "purpose": "验证白名单内端口 send_data 经 COM10 发送、COM11 读回、read_data 返回快照",
      "doesNotProve": "真实物理设备兼容性",
      "reason": "尚未实现，G2 评审后实施"
    },
    {
      "command": "端口白名单外被拒 / 任意 RPC 拒绝",
      "kind": "integration-test",
      "status": "not-run",
      "purpose": "验证白名单外端口操作与 MCP 子进程任意 RPC 被拒",
      "doesNotProve": "合法授权路径",
      "reason": "尚未实现，G2 评审后实施"
    },
    {
      "command": "npm run build:backend / npm run check / npm run process:check",
      "kind": "native-build / syntax-check / process-contract",
      "status": "not-run",
      "purpose": "验证构建与 change 包结构",
      "doesNotProve": "MCP 运行行为",
      "reason": "尚未实现，G2 评审后实施"
    }
  ],
  "residualRisk": [
    "改变默认安全边界，向外部进程暴露串口能力",
    "写工具（send_data/send_and_expect）经端口白名单授权后放行，不逐次确认",
    "真实物理设备未授权；COM10/COM11 为 ELTIMA 虚拟串口对"
  ],
  "handoff": {
    "state": "draft",
    "request": "G2：独立评审 design.md 与 specification.md（MCP 传输/工具/端口白名单授权/read_data 语义/COM10/COM11 验证边界）"
  }
}
```
