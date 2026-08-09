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
  "verification": [],
  "residualRisk": [
    "改变默认安全边界，向外部进程暴露串口能力",
    "写工具与真实设备写入需用户显式授权",
    "依赖引入需许可证审查"
  ],
  "handoff": {
    "state": "draft",
    "request": "G1：用户确认传输、工具暴露清单、授权模型与真实设备边界"
  }
}
```
