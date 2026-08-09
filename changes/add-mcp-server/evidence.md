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
    "reviewStage": "G2-design",
    "reviewResult": "conditionally-approved",
    "reviewRound": 1,
    "p1": 1,
    "p2": 2,
    "p1Notes": [
      "design.md 工具授权表（send_data/send_and_expect 行）残留'每次确认'，与授权模型'白名单内即放行'及 G1 决策矛盾，须修正后进入实现"
    ],
    "p2Notes": [
      "MCP stdio 协议实现细节未定（@modelcontextprotocol/sdk 或自研；initialize protocolVersion、tools/call params 结构）",
      "spec 场景 read_data 未精确说明读哪个会话/端口（send_data 到 COM10 后 COM11 读回，read_data 需明确目标会话）"
    ],
    "request": "实施者须先修正 design.md P1 矛盾，再进入实现；真实设备未授权，不接物理串口"
  }
}
```
