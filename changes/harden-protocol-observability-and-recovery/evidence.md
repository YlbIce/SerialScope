# Evidence: harden-protocol-observability-and-recovery

```json
{
  "change": "harden-protocol-observability-and-recovery",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T14:10:02Z",
  "verification": [
    {"command": "npm run test:diagnostics", "kind": "unit-test", "status": "passed", "purpose": "验证 Main JSONL 的 runId、API Key 脱敏和有界轮转", "doesNotProve": "真实桌面崩溃现场"},
    {"command": "npm run test:backend-diagnostics", "kind": "native-backend-integration", "status": "passed", "purpose": "启动新编译 C++ 后端并验证 backend-start、RPC 请求元数据和同一 runId 的 JSONL", "doesNotProve": "串口收发或 Renderer 故障事件"},
    {"command": "npm run test:serial-reconnect", "kind": "policy-unit-test", "status": "passed", "purpose": "验证自动重连默认需启用、600 ms 指数退避、8 s 上限、8 次边界和手动关闭取消", "doesNotProve": "被占用 COM 端口的实际恢复"},
    {"command": "npm run build:backend", "kind": "native-build", "status": "passed", "purpose": "验证诊断后端和 921600 bps 短帧突发写入辅助程序可编译并部署", "doesNotProve": "虚拟/真实串口负载表现"},
    {"command": "backend/build/serialscope-frame-decoder-tests.exe && backend/build/serialscope-checksum-engine-tests.exe && backend/build/serialscope-ai-adapter-tests.exe", "kind": "native-regression", "status": "passed", "purpose": "验证核心解帧、校验和 AI 适配器无回归", "doesNotProve": "JSON-RPC 串口生命周期"},
    {"command": "npm run build:renderer && npm run check && npm run process:check", "kind": "renderer-static-and-process", "status": "passed", "purpose": "验证 Renderer 诊断接入、自动重连 UI、语法和 L2 证据格式", "doesNotProve": "真实用户交互或物理设备"},
    {"command": "npm run test:named-pipe-protocol-lifecycle", "kind": "virtual-serial-protocol-lifecycle", "status": "passed", "purpose": "验证 open/send/rx/tx/close/reopen、错误输入和状态统计", "doesNotProve": "真实设备协议兼容性或跨会话行为"},
    {"command": "npm run test:named-pipe-fixed-frame", "kind": "virtual-serial-max-frame", "status": "passed", "purpose": "验证 921600 bps 下 128 KiB 固定帧完整传输", "doesNotProve": "真实硬件吞吐"},
    {"command": "npm run test:named-pipe-load", "kind": "virtual-serial-load", "status": "passed", "purpose": "验证 921600 bps 下 1000 个 LF 分隔短帧的完整解码、通知与统计；测试载荷不包含 LF", "doesNotProve": "真实硬件吞吐或私有分帧协议"},
    {"command": "npm run test:electron-ui", "kind": "visible-electron-ui-regression", "status": "passed", "purpose": "验证可见主界面经 COM10/COM11 打开、收发、宏 CRC 计算/保存/执行与模拟器交互", "doesNotProve": "真实物理设备行为"}
  ],
  "residualRisk": ["日志记录元数据而非报文内容，不能替代完整抓包。", "跨 Windows 会话、真实设备、签名发布和正式法务审查尚未完成。"],
  "handoff": {"state": "ready-for-review", "request": "请独立只读审核 L2 实现与证据；不得自动归档"}
}
```
