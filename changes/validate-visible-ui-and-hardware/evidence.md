# Evidence: validate-visible-ui-and-hardware

```json
{
  "change": "validate-visible-ui-and-hardware",
  "riskTier": "L3",
  "recordedAt": "2026-08-04T01:30:00+08:00",
  "verification": [
    {
      "command": "Get-CimInstance Win32_SerialPort",
      "kind": "environment-discovery",
      "status": "passed",
      "purpose": "发现可供安全验证的真实串口设备",
      "doesNotProve": "蓝牙串口是可安全测试的物理设备；也不授权向任何端口发送"
    },
    {
      "command": "npm run test:electron-ui && npm run test:production-simulator",
      "kind": "production-desktop-integration",
      "status": "passed",
      "purpose": "验证可见 Electron UI 的 COM10/COM11 打开、收发、关闭、宏执行、模拟下位机，以及生产 Main/sandbox=true 下五个独立模块窗口和模拟器接管/恢复。",
      "doesNotProve": "真实硬件兼容性或原生菜单每一项的人机点击"
    },
    {
      "command": "node scripts/authorized-modbus-register-flow.js --authorized-com10-to-com11-modbus-slave --confirm-write-register-1-101",
      "kind": "authorized-modbus-slave-integration",
      "status": "passed",
      "purpose": "经用户明确授权，以固定 COM10（ELTIMA 配对端）在 115200、8 数据位、1 停止位、无校验、无流控下连接 COM11 上的 Modbus Slave；先发送 01 03 00 00 00 01 并经 CRC/应答校验读得寄存器 0=100，才发送 01 06 00 01 00 65，收到写单寄存器回显后确认寄存器 1=101。03 读应答的 CRC、异常、超时或值不等于 100 会阻止 06；06 已发送后的 CRC、异常或超时会报告“写入未确认”并关闭串口，不能推断为未写入。成功实测在后续加入有界 RPC/清理和 TX/RX 序号围栏前完成；为避免第三次重复写 101，最终版本未重新发出 06，新增安全逻辑由下方无写入受控测试和独立复核证明。",
      "doesNotProve": "COM11 上的 Modbus Slave 为真实物理设备，或任意现场设备均允许相同写入。"
    },
    {
      "command": "node scripts/test-authorized-modbus-register-flow.js",
      "kind": "authorized-modbus-safety-unit",
      "status": "passed",
      "purpose": "不打开串口、不发送报文；验证 Modbus 等待器仅消费匹配本次请求 TX 序号之后的 RX，拒绝此前遗留的有效帧和其后的 CRC 错误帧。",
      "doesNotProve": "最终受限脚本已再次对 COM11 进行写入，或负向情形已在外部 Modbus Slave 上演练。"
    },
    {
      "command": "authorized physical serial integration",
      "kind": "physical-device-integration",
      "status": "not-run",
      "reason": "本轮获授权的是 COM11 上的 Modbus Slave 模拟下位机，不是已确认的物理设备；仍缺少物理设备身份、连接参数和安全探测授权。",
      "purpose": "验证真实设备串口收发",
      "doesNotProve": "虚拟端口可替代真实设备"
    }
  ],
  "residualRisk": ["可见 UI 和本次 Modbus 请求/写入均由 ELTIMA COM10/COM11 覆盖；COM11 为用户运行的 Modbus Slave 模拟下位机，不能代替物理设备证据。", "真实设备探测仍需设备身份、端口、波特率/校验配置、仅接收或安全查询报文及明确发送授权。"],
  "review": {
    "status": "conditionally-approved",
    "p1": 0,
    "p2": 2,
    "summary": "独立只读审核确认固定授权范围、双确认、CRC、03 值门禁、有界 RPC、内层 finally 清理和 TX/RX 序号围栏；无写入测试直接证明遗留帧与 CRC 错帧不会驱动本次流程。最终安全收紧版本未为避免第三次重复写 101 而再次外部执行，且外部 Slave 的负向异常未演练。COM11 为模拟下位机，物理设备仍 not-run。"
  },
  "handoff": {
    "state": "implementing",
    "request": "UI 验收已完成；真实设备步骤保持 L3 人工安全闸门，获得设备与授权后才能继续。"
  }
}
```
