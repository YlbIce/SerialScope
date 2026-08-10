# Evidence: prepare-release-and-external-validation

```json
{
  "change": "prepare-release-and-external-validation",
  "riskTier": "L3",
  "recordedAt": "2026-08-09T13:50:14Z",
  "verification": [
    {"command": "npm run test:release-compliance-gates", "kind": "documentation-gate-check", "status": "passed", "purpose": "检查 9.5–9.8 的受控发布、会话、LGPL 和设备闸门", "doesNotProve": "证书、会话、法务或真实设备证据"},
    {"command": "Windows test-channel NSIS signing/update", "kind": "release-integration", "status": "blocked", "purpose": "验证签名安装包、升级和自动更新", "doesNotProve": "生产发布", "reason": "未提供签名通道、更新源和发布批准"},
    {"command": "two real Windows sessions", "kind": "cross-session-security", "status": "blocked", "purpose": "验证同 SID 和异 SID 的 Named Pipe 拒绝", "doesNotProve": "单元 DACL 逻辑", "reason": "未提供第二真实 Windows 会话/账户授权"},
    {"command": "authorized physical device regression", "kind": "physical-device-l3", "status": "not-run", "purpose": "验证真实 Modbus Slave/PLC", "doesNotProve": "虚拟 COM 模拟器", "reason": "未提供设备、参数、报文白名单和二次确认"}
  ],
  "residualRisk": ["全部外部 L3 闸门仍待人工授权和真实环境证据。"],
  "handoff": {"state": "implementing", "request": "不得自动发布、归档或向真实设备写入"}
}
```
