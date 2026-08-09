# Evidence: add-device-test-workbench

```json
{
  "change": "add-device-test-workbench",
  "riskTier": "L2",
  "recordedAt": "2026-08-04T02:20:00+08:00",
  "verification": [
    {
      "command": "architecture audit: macro/rule/simulator/log renderer inspection",
      "kind": "design-audit",
      "status": "passed",
      "purpose": "确认宏、规则、模拟器与毫秒序列日志可作为测试工作台的复用基础。",
      "doesNotProve": "用例执行、断言或报告行为。"
    },
    {
      "command": "npm run test:device-workbench",
      "kind": "production-electron-virtual-serial-integration",
      "status": "passed",
      "purpose": "以 ELTIMA COM10/COM11 验证宏发送、读取等待、Modbus 03 寄存器字段（起始地址 0、目标地址 0、U16 大端）条件分支和执行报告。",
      "doesNotProve": "真实硬件执行、超时和用户取消的桌面交互。"
    },
    {
      "command": "npm run test:flow-runtime",
      "kind": "unit-runtime-safety",
      "status": "passed",
      "purpose": "验证 HEX/文本/文本正则/规则/变量、Modbus 03/04 寄存器地址与数据类型、通用字节偏移字段、变量模板、实际延迟、断言成功与失败阻断、受控循环和缺失出边失败边界。",
      "doesNotProve": "Electron 交互和实际串口通知。"
    },
    {
      "command": "npm run test:workbench-authorization",
      "kind": "main-process-safety-gate",
      "status": "passed",
      "purpose": "验证默认模拟目标拒绝非 COM10/COM11、真实设备必须原生确认、端口变化或授权过期后拒绝发送。",
      "doesNotProve": "真实设备发送授权或模拟下位机已经就绪。"
    },
    {
      "command": "npm run test:virtual-simulator-port",
      "kind": "main-process-virtual-port-contract",
      "status": "passed",
      "purpose": "验证双实例启动和子实例自动开口共同使用的端口登记校验，兼容 Native 后端 ports.list 的 { ports: [...] } 返回，并拒绝非 ELTIMA 虚拟串口和缺失端口。",
      "doesNotProve": "第二个 Electron 实例在当前自动化会话中已实际启动、占用 COM10 并完成配对收发。"
    },
    {
      "command": "npm run test:workbench-dual-simulator",
      "kind": "visible-electron-dual-instance-virtual-serial-integration",
      "status": "passed",
      "purpose": "以可见 React 工作台和真实 Native 后端打开 COM11，启动实际子 Electron（生产 main）自动打开 COM10；验证分段 Modbus 请求经受限短空闲窗口聚合后得到内置应答、RX 帧、规则真分支、通过状态，以及包含流程版本、实际宏 v3 快照、步骤和消费帧的结构化报告；从报告重放后再次执行同一 COM11↔COM10 流程。",
      "doesNotProve": "真实物理设备执行，完整生产 Main 菜单到 workbench:launchSimulator IPC 路由的 CDP 自动化，或 raw 模式下相邻独立报文不会被短窗口合并。"
    },
    {
      "command": "npm run test:react-workbench-ui",
      "kind": "visible-electron-ui",
      "status": "passed",
      "purpose": "验证可见 React Flow 画布、可编辑规则命中、宏 ID/版本保存与检查器宏库切换、Modbus 条件的从站/功能码/起始地址/目标地址/字段类型/数值配置持久化、循环节点加入、等待报文时取消收敛；并验证宏已发送后读取超时的失败报告保留实际宏快照、旧内联宏自动迁移为写入节点且可执行不伪造宏快照、用例版本/报告重放、JSON/CSV/HTML 报告导出和独立工作台窗口缩放。",
      "doesNotProve": "真实硬件发送、人工拖拽编排或生产 Main 菜单到工作台的全路径。"
    }
  ],
  "residualRisk": ["真实设备执行未授权。", "双实例的生产 Main 菜单/IPC 路由尚未由 CDP 全路径覆盖；本轮已经以可见工作台、真实后端和实际子 Electron 实例验证 COM11↔COM10 交互。", "raw 模式以 8 ms 空闲、24 ms 绝对截止聚合读取块并限制为 64 KiB；它避免半帧和无界增长，但相邻独立 raw 报文仍可能合并，推荐使用确定性分帧模式。", "React 工作台及独立进程模拟器在当前 Windows/Electron 环境需 sandbox=false 才能避免 renderer launch-failed，仍保持 contextIsolation、nodeIntegration=false 和 CSP；该安全例外未解决。"],
  "review": {"status": "conditionally-approved", "p1": 0, "p2": 1, "summary": "独立只读复核已重跑运行时、可见 UI、COM10/COM11 和双实例回归。Modbus CRC/精确长度/字段类型、文本正则无效安全失败、通用字节字段边界和 UI 全字段持久化均通过；P2 为合法但病态的文本正则在长 RX 文本上的性能限制。既有 sandbox=false、生产 Main 菜单/IPC/授权器全路径和 raw 聚合限制继续保留。"},
  "handoff": {"state": "review-passed", "request": "保持活动变更，不得自动归档。结构化条件已验收；病态文本正则性能限制、sandbox=false、生产 Main 菜单/IPC/授权器全路径和 raw 聚合语义限制必须持续记录。"}
}
```
