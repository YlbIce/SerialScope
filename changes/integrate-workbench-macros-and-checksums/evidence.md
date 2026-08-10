# Evidence: integrate-workbench-macros-and-checksums

```json
{
  "change": "integrate-workbench-macros-and-checksums",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T14:10:02Z",
  "verification": [
    {
      "command": "npm run test:workbench-checksums",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证常见 CRC 的标准向量、字节序与非法 HEX 拒绝边界",
      "doesNotProve": "真实设备是否接受带校验的报文"
    },
    {
      "command": "npm run test:react-workbench-ui",
      "kind": "visible-electron-ui-test",
      "status": "passed",
      "purpose": "验证工作台载入主界面宏、选择 legacy 引用并在工作台宏编辑区追加 CRC16-Modbus",
      "doesNotProve": "主界面宏编辑器经虚拟串口发送的端到端行为"
    },
    {
      "command": "npm run test:flow-runtime",
      "kind": "flow-runtime-regression",
      "status": "passed",
      "purpose": "验证流程运行时与宏快照、受控循环的既有边界未回归",
      "doesNotProve": "主界面宏编辑器或真实串口行为"
    },
    {
      "command": "npm run check && npm run process:check",
      "kind": "static-and-process-check",
      "status": "passed",
      "purpose": "验证受改 JavaScript 语法与 L2 变更包/证据格式",
      "doesNotProve": "桌面控件的端到端串口收发"
    },
    {
      "command": "npm run test:electron-ui",
      "kind": "virtual-serial-electron-ui-regression",
      "status": "passed",
      "purpose": "验证主界面宏编辑器计算 CRC 后保存并经 COM10/COM11 发送",
      "doesNotProve": "真实设备对 CRC 报文的接受情况"
    }
  ],
  "residualRisk": ["不支持私有 CRC 参数组合；CRC32 的追加字节序固定为小端。", "真实物理设备验证未获授权。"],
  "handoff": {
    "state": "ready-for-review",
    "request": "请独立只读审核 L2 实现与证据；不得自动归档"
  }
}
```
