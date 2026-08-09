# Evidence: stabilize-data-path

```json
{
  "change": "stabilize-data-path",
  "riskTier": "L2",
  "recordedAt": "2026-08-02T00:00:00Z",
  "preImplementation": [
    {
      "command": "人工代码检查：WebSocketSession::outgoing_、connectWebSocket、addTransferLog",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "记录实施前的无界队列、竞争重连和同步日志重绘缺口",
      "doesNotProve": "运行时性能或真实设备行为"
    }
  ],
  "verification": [
    {
      "command": "npm run build:backend",
      "kind": "native-build",
      "status": "passed",
      "purpose": "确认 C++ 传输与协议校验改动可构建",
      "doesNotProve": "真实串口硬件行为"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "确认 Renderer 修改可被 Node 解析",
      "doesNotProve": "Electron UI 或 WebSocket 运行时行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "确认两个 change 包与证据可解析",
      "doesNotProve": "产品行为"
    },
    {
      "command": "临时启动 backend/bin/serialscope-backend.exe --port 47991，并以 ClientWebSocket 发送 payload 为字符串的 serial:open",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "确认畸形 payload 返回带 requestId 的 error，且后端未退出",
      "doesNotProve": "所有字段类型、队列上限或真实串口行为"
    },
    {
      "command": "临时后端打开 COM10；通过 COM11 注入 VSP_RX_20260802 并接收后端发送的 VSP_TX_20260802",
      "kind": "virtual-serial-integration",
      "status": "passed",
      "purpose": "验证 ELTIMA 虚拟串口对上的 COM11→COM10 接收与 COM10→COM11 发送链路",
      "doesNotProve": "Renderer UI 重连、慢客户端背压阈值或真实物理设备兼容性"
    },
    {
      "command": "向 COM11 写入 2 MiB 数据且暂不读取 WebSocket，再请求 serial:send",
      "kind": "backpressure-integration",
      "status": "blocked",
      "purpose": "验证实时队列满载时控制结果仍优先送达",
      "doesNotProve": "控制队列行为或慢客户端阈值",
      "reason": "虚拟串口大块写入阶段在 60 秒工具时限内未完成；临时后端监听已确认清理。"
    },
    {
      "command": "Electron 手工 smoke",
      "kind": "manual-smoke",
      "status": "not-run",
      "purpose": "观察后端重启后的 UI 重连",
      "doesNotProve": "真实串口数据完整性",
      "reason": "本轮未启动 GUI 自动化或人工应用会话"
    },
    {
      "command": "真实串口硬件验证",
      "kind": "hardware",
      "status": "not-run",
      "purpose": "确认真实设备上的串口读写不受影响",
      "doesNotProve": "任何硬件兼容性",
      "reason": "未获设备操作授权，且本次不改变串口字节语义"
    }
  ],
  "residualRisk": [
    "未执行 Electron 手工 smoke，未直接观察重启后的 Renderer 重连与 UI 合帧。",
    "慢速 WebSocket 背压集成压测被虚拟串口大块写入超时阻断；队列分级逻辑已构建但吞吐阈值未做性能标定。",
    "真实串口硬件验证未获授权；帧边界/拆包问题仍由后续 change 处理。"
  ],
  "handoff": {"state": "archived", "reviewResult": "approved", "archiveProof": "changes/stabilize-data-path/archive.md"}
}
```
