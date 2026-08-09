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
      "purpose": "确认仓库无 MCP SDK 依赖、无既有 MCP 实现，采用自研最小 MCP stdio 协议",
      "doesNotProve": "MCP Server 的目标行为"
    }
  ],
  "remediation": [
    {
      "command": "scripts/test-mcp-serial.js（COM10/COM11 端到端）",
      "kind": "virtual-serial-integration",
      "status": "blocked",
      "purpose": "验证白名单内 send_data 经 COM10 发送、COM11 读回",
      "doesNotProve": "真实物理设备兼容性",
      "observed": "reader 退出码 5；Get-CimInstance Win32_SerialPort 仅发现 COM3/COM4（蓝牙），COM10/COM11 ELTIMA 虚拟串口对当前未创建",
      "reason": "虚拟串口对不可用，无法端到端收发验证"
    }
  ],
  "verification": [
    {
      "command": "npm run test:mcp-handshake",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "验证 MCP stdio 握手 initialize、tools/list（7 工具）、tools/call 经 IPC 转发与回传、未知工具 -32602",
      "doesNotProve": "串口授权行为与真实设备"
    },
    {
      "command": "npm run test:mcp-authorization",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "验证端口白名单外写被拒（-32002）、白名单内 send_data 映射 serial.send、方法白名单外被拒（-32001）、read_data 快照、白名单持久化、缺 payload 被拒（-32602）、P1 会话隔离（当前会话已打开不同端口时 MCP open/configure 被拒 -32003；同端口或空闲时放行）",
      "doesNotProve": "真实串口收发"
    },
    {
      "command": "COM10/COM11 端到端（send_data/read_data）",
      "kind": "virtual-serial-integration",
      "status": "blocked",
      "purpose": "验证 MCP send_data 经 COM10 发送、COM11 读回、read_data 返回快照",
      "doesNotProve": "真实物理设备兼容性",
      "reason": "当前环境 COM10/COM11 虚拟串口对不可用（仅 COM3/COM4）"
    },
    {
      "command": "npm run check / npm run process:check",
      "kind": "syntax-check / process-contract",
      "status": "passed",
      "purpose": "验证 JS 语法与 change 包结构（20 个活动 change）",
      "doesNotProve": "MCP 运行行为"
    }
  ],
  "residualRisk": [
    "改变默认安全边界，向外部进程暴露串口能力；写工具经端口白名单授权后放行",
    "COM10/COM11 端到端 blocked，虚拟串口对不可用；真实物理设备未授权",
    "自研 MCP stdio 最小实现，未验证真实 Claude Desktop/Cursor 客户端兼容性",
    "MCP 客户端（第三方）权限模型不可控，Main 侧授权门面独立于其可信度"
  ],
  "handoff": {
    "state": "ready-for-review",
    "reviewStage": "G3-implementation",
    "reviewResult": "conditionally-approved",
    "reviewRound": 2,
    "p1": 1,
    "p2": 2,
    "p1Notes": [
      "MCP open_connection/configure_connection 复用全局 serial.open，会抢占/替换 Electron 主界面当前串口会话；L3 安全边界下 MCP 打开端口可能干扰主会话，缺乏会话隔离，须约束后进入真实设备/归档"
    ],
    "p2Notes": [
      "send_and_expect 发完立即读 RX 快照，无等待/超时，与 expect 语义不符",
      "read_data/send_and_expect 的 RX 缓冲无端口隔离（全局缓冲）"
    ],
    "request": "实施者须先解决 P1（MCP 会话隔离）后进入下一阶段；COM10/COM11 端到端仍 blocked；真实设备未授权，不得归档"
  }
}
```
