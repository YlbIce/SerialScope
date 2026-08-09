# Evidence: add-device-simulator

```json
{
  "change": "add-device-simulator",
  "riskTier": "L2",
  "recordedAt": "2026-08-03T05:00:00Z",
  "verification": [
    {"command": "npm run test:electron-ui", "kind": "visible-desktop-and-virtual-serial-integration", "status": "passed", "purpose": "在可见 Electron 窗口中保存宏和模拟配置；COM11 模拟实例通过原生 COM10 全双工辅助程序验证 41 42 -> CA FE 与 AT -> OK CRLF", "doesNotProve": "真实设备协议兼容性或跨用户 ACL"},
    {"command": "npm run test:production-simulator", "kind": "production-main-and-virtual-serial-integration", "status": "passed", "purpose": "以生产 src/main/main.js、sandbox=true 和隔离 profile 启动应用；独立模拟窗口接管后主窗口停止应答。原生 COM10 全双工辅助程序在收到预期 CA FE 后继续静默读取 250ms，额外字节将失败，故确认仅一份回复；关闭子窗口后主窗口恢复应答", "doesNotProve": "真实设备协议兼容性或跨用户 ACL"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证 Main、Preload 和 Renderer 可解析", "doesNotProve": "真实串口行为"}
  ],
  "residualRisk": ["Modbus 是调试用子集，不验证请求 CRC，也不实现完整寄存器映射。", "随机数据通过浏览器密码学随机源生成；模板只接受 1 到 1024 字节的 RANDHEX。", "模拟串口验证使用 ELTIMA COM10/COM11，不是物理设备。", "模拟配置会经 localStorage storage 事件同步；极短的并发编辑仍采用最后保存者覆盖。"],
  "handoff": {"state": "review-passed", "review": "独立只读审核 conditionally-approved（P1=0）；生产 Main 的唯一执行者和无重复回复已复核。P2 为 250ms 静默窗口、最后保存者覆盖和 Modbus 调试子集。", "request": "不得自动归档。"}
}
```
