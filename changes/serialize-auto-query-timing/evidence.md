# Evidence: serialize-auto-query-timing

```json
{
  "change": "serialize-auto-query-timing",
  "riskTier": "L3",
  "recordedAt": "2026-08-03T14:05:00Z",
  "verification": [
    {
      "command": "CSV inspection: C:\\Users\\13686\\Desktop\\serialscope-log-20260803-212505.csv",
      "kind": "diagnostic-evidence",
      "status": "passed",
      "purpose": "确认高频段 526 TX / 471 RX、结束积压 55、最大在途推断值 64，建立修复前失败边界。",
      "doesNotProve": "毫秒级物理线路时序；原 CSV 只有秒级时间。"
    },
    {
      "command": "npm run test:auto-query-backpressure-ui",
      "kind": "production-electron-ui-integration",
      "status": "passed",
      "purpose": "生产 Electron 打开 COM11 后，以 10 ms 周期、30 ms 应答超时发送无应答报文；180 ms 内 TX 至少两帧、RX 为零，且在途数始终不超过 1，证明超时分支不会积压并能调度下一轮。",
      "doesNotProve": "COM10 对端应答与收发数收敛，或真实硬件行为。"
    },
    {
      "command": "npm run test:log-export-contract",
      "kind": "static-log-export-contract-test",
      "status": "passed",
      "purpose": "静态检查 TX/RX/SYS 均写入单调 sequence 和毫秒时间，且 CSV 导出包含 sequence,time,direction,bytes,text,hex 字段。",
      "doesNotProve": "运行时文件保存或 CSV 文件解析。"
    },
    {
      "command": "npm run test:auto-query-timing",
      "kind": "production-electron-virtual-serial-integration",
      "status": "passed",
      "purpose": "生产 Electron 在 COM11 以 10 ms 自动查询，COM10 原生应答器持续响应至静默；至少完成 20 个往返后关闭自动发送并等待收敛，验证 TX=RX=对端应答数，且在途数不超过 1。",
      "doesNotProve": "真实硬件或规约级应答关联。"
    },
    {
      "command": "npm run test:production-simulator",
      "kind": "production-electron-virtual-serial-regression",
      "status": "failed",
      "purpose": "回归既有生产 Electron 模拟器唯一应答流程。",
      "doesNotProve": "本 change 的单在途逻辑。",
      "reason": "在串口配置模块执行 window.resizeTo(700, 820) 后，窗口仍为 620×760；未进入模拟器交互阶段。"
    },
    {
      "command": "node --check scripts/test-auto-query-timing.js && node --check scripts/test-auto-query-backpressure-ui.js && node --check scripts/test-log-export-contract.js && npm run check && npm run process:check && git diff --check",
      "kind": "static-and-process-check",
      "status": "passed",
      "purpose": "验证前端、测试脚本和活动变更包可解析且无补丁空白错误。",
      "doesNotProve": "虚拟或真实串口的完整请求—应答收敛。"
    }
  ],
  "residualRisk": ["泛型模式将发送后的第一条 RX 视为应答。", "生产模拟器回归在独立串口配置窗口的脚本化缩放断言失败。", "真实硬件验证仍未授权。"],
  "handoff": {"state": "review-passed", "review": "独立只读终审 conditionally-approved（P1=0，P2=1）：10 ms 无应答超时、单在途和停止后 TX=RX=对端应答数均通过；serial-config 脚本化缩放回归 failed，须由窗口缩放 change 修复并复跑。", "request": "不得自动归档。"}
}
```
