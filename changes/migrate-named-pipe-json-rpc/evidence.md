# Evidence: migrate-named-pipe-json-rpc

```json
{
  "change": "migrate-named-pipe-json-rpc",
  "riskTier": "L3",
  "recordedAt": "2026-08-03T05:00:00Z",
  "preImplementation": [
    {"command": "审核 add-fixed-length-framing 的 WebSocket 最大帧端到端验证", "kind": "review", "status": "passed", "purpose": "确认旧传输层不应继续作为最大帧验收基础", "doesNotProve": "Named Pipe 实现正确"}
  ],
  "verification": [
    {"command": "vcpkg install json-rpc-cxx:x64-windows", "kind": "dependency-poc", "status": "blocked", "reason": "本机代理 TLS 握手失败：curl error 35，未下载源码。", "purpose": "验证第三方 JSON-RPC 库可获取并可接入 CMake", "doesNotProve": "JSON-RPC 或 Named Pipe 行为"},
    {"command": "npm run test:named-pipe", "kind": "integration-test", "status": "passed", "purpose": "验证 Named Pipe 长度前缀、backend.ready、backend.ping、标准 -32601 未知方法、batch/数组 params、Electron Main 客户端、4 MiB+1 拒绝恢复和 ready 超时", "doesNotProve": "跨用户 DACL AccessCheck、恰好 4 MiB 出站消息、串口 RPC"},
    {"command": "npm run build:backend", "kind": "native-build", "status": "passed", "purpose": "验证 Win32 Named Pipe 服务端和 C++ 后端可构建", "doesNotProve": "运行时 ACL 与串口行为"},
    {"command": "npm run check", "kind": "syntax-check", "status": "passed", "purpose": "验证 Electron Main、Preload 和现有 Renderer 可被 Node 解析", "doesNotProve": "Renderer 已迁移到 Named Pipe"},
    {"command": "npm run process:check", "kind": "process-contract", "status": "passed", "purpose": "验证 L3 变更包结构和机器可读证据", "doesNotProve": "产品行为"},
    {"command": "node scripts/run-electron.js --dev 持续运行超过 5 秒", "kind": "desktop-smoke", "status": "passed", "purpose": "验证 Renderer 经 Main Named Pipe RPC 桥启动时未立即退出", "doesNotProve": "可见窗口或串口数据面"},
    {"command": "Win32 原生 COM10 写入、COM11 读取 CA FE", "kind": "virtual-serial-integration", "status": "passed", "purpose": "确认 ELTIMA COM10/COM11 虚拟串口对和测试环境可用", "doesNotProve": "CSerialPort 后端收发"},
    {"command": "Named Pipe serial.open/send 与 Win32 COM11 原生读取；以及 Win32 COM11 写入与 serial.rx notification（CSerialPort 4.3.3）", "kind": "virtual-serial-integration", "status": "failed", "purpose": "记录后端 CSerialPort 4.3.3 经 Named Pipe 的双向数据面失败边界", "doesNotProve": "CSerialPort v5 或修复后的 Named Pipe 通知行为", "failureBoundary": "后端返回串口已打开和 serial.send 成功，但 COM11 无字节；反向写入后亦无 serial.rx。"},
    {"command": "npm run build:backend（vendored CSerialPort v5.0.0.260619）", "kind": "native-build", "status": "passed", "purpose": "验证 CSerialPort v5 静态构建并链接到 Native 后端", "doesNotProve": "真实设备串口兼容性"},
    {"command": "Named Pipe serial.send COM10 + Win32 COM11 reader", "kind": "virtual-serial-integration", "status": "passed", "purpose": "验证 JSON-RPC serial.send 的 CA FE 经 COM10 到 ELTIMA COM11 的实际字节传输", "doesNotProve": "反向接收、最大 fixed 帧或真实设备"},
    {"command": "Win32 COM11 writer + Named Pipe serial.rx notification COM10", "kind": "virtual-serial-integration", "status": "passed", "purpose": "验证 41 42 经 ELTIMA COM11 到 CSerialPort v5 COM10 后端、Asio 分发与 Named Pipe notification 的完整反向路径", "doesNotProve": "最大 fixed 帧、真实设备或慢客户端"},
    {"command": "npm run test:named-pipe && npm run check && npm run process:check", "kind": "regression", "status": "passed", "purpose": "回归 Named Pipe JSON-RPC 基础、Electron Main 客户端、边界恢复、JavaScript 语法和变更包契约", "doesNotProve": "跨用户 DACL、精确 4 MiB 出站、可见窗口或真实设备"},
    {"command": "npm run test:named-pipe-fixed-frame", "kind": "virtual-serial-integration", "status": "passed", "purpose": "以 COM10 fixed=131072 打开，原生 COM11 辅助程序写入 131072 字节并校验 serial.rx 字节数及首尾字节", "doesNotProve": "真实硬件吞吐或更大协议帧"},
    {"command": "npm run test:named-pipe-outbound-boundary", "kind": "transport-integration", "status": "passed", "purpose": "验证恰好 4 MiB JSON-RPC 出站响应、4 MiB+1 拒绝后的恢复，以及未读取的原生慢客户端超时后服务端恢复", "doesNotProve": "跨用户/跨会话访问控制或真实串口"},
    {"command": "npm run test:named-pipe-single-client", "kind": "transport-integration", "status": "passed", "purpose": "验证第二 Named Pipe 客户端收到 busy/timeout，主客户端仍可完成请求", "doesNotProve": "跨用户或跨会话拒绝"},
    {"command": "npm run test:named-pipe-serial", "kind": "virtual-serial-integration", "status": "passed", "purpose": "使用原生 COM10/COM11 辅助程序验证 CSerialPort v5 双向 serial.send 和 serial.rx，替代会被 Defender 拦截的 PowerShell/System.IO.Ports 路径", "doesNotProve": "真实物理串口"},
    {"command": "npm run build:backend && npm run test:named-pipe-outbound-boundary && npm run test:named-pipe-fixed-frame && npm run test:named-pipe-single-client", "kind": "regression", "status": "passed", "purpose": "验证修复 readExact/断开并发生命周期后的传输回归", "doesNotProve": "跨用户/跨会话人工拒绝或真实硬件"}
  ],
  "residualRisk": ["DACL 限制当前 TokenUser SID，服务端还按 ProcessIdToSessionId 拒绝其他 Windows 会话；由于没有可用的第二会话或第二用户凭据，跨用户/跨会话实际拒绝仍是 not-run。", "慢客户端测试以 3 秒后服务端恢复间接覆盖 2 秒 CancelIoEx 超时，未从生产日志直接导出超时原因和精确耗时。", "第三方 json-rpc-cxx 依赖因本机代理 TLS 问题 blocked，当前使用 nlohmann_json 实现 JSON-RPC dispatcher。", "真实物理串口未授权且未提供设备/参数。"],
  "handoff": {"state": "in_progress", "review": "前一轮独立审核曾拒绝，原因是跨会话未实现、readExact 生命周期和过时 WebSocket 注释；实现已修复，需重新独立审核。", "request": "L3 change 保持 in_progress；不得自动归档。需先完成跨用户与跨会话实际拒绝、真实硬件验收并由独立审核通过，再等待人工归档确认。"}
}
```
