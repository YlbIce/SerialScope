# 工作台账

记录归档后事件，以及提交前的变更摘要。台账是可检索摘要，不替代 `changes/<change-id>/evidence.md` 的原始证据。

## 记录格式

```md
## <ISO 8601 时间> · <commit|archive> · <change-id>
- 需求来源：<用户、工单或待补充>
- 范围：<模块与非目标>
- 实现：<可核验事实>
- 验证：<命令 + status；not-run/blocked 必须带原因>
- 风险与后续：<残余风险或无>
- 关联：<change 路径、evidence 路径、SHA 或 archive proof>
```

## 条目

## 2026-08-09 · L3 · add-mcp-server P2 修复（ready-for-review，推送待恢复，未归档）

- 需求来源：G3 审核 P2（send_and_expect 无等待、RX 缓冲无端口隔离），用户要求处理 P2。
- 实现：`McpBridge._waitForNewRx`（send_and_expect 发送后等待新 RX 或超时）；`currentPort` 记录（open/configure 后）；read_data 指定不匹配端口返回空（端口隔离）。
- 验证：`npm run test:mcp-authorization` passed（新增 3 个 P2 场景：currentPort 记录/read_data 端口隔离返回空/send_and_expect 等待返回新 RX）；`test:mcp-handshake`、`npm run check`、`npm run process:check`（20 个活动 change）passed。
- 风险与后续：P1/P2 均已解决（p1Resolved/p2Resolved=true）；COM10/COM11 端到端仍 blocked；真实设备未授权。本地提交 `7957ec7`（P2 修复），连同 `5fbd67b`/`8b62774`/`66ddf31`/`d8f7038` 共 5 个提交**推送 blocked**：连不上 github.com，待恢复后 `git push origin master`。
- 关联：`changes/add-mcp-server/`；本地提交 `7957ec7`。

## 2026-08-09 · L3 · add-mcp-server P1 修复（ready-for-review，推送待恢复，未归档）

- 需求来源：G3 审核发现 P1（MCP open_connection/configure_connection 复用全局 serial.open 抢占主会话），用户要求修复 P1。
- 实现：`McpBridge._dispatchTool` 改为 async；新增 `_ensureNotStealingSession`——当前会话已打开不同端口时 MCP open/configure 拒绝（-32003），同端口或空闲时放行。
- 验证：`npm run test:mcp-authorization` passed（新增 4 个会话隔离场景：抢占被拒/同端口放行/空闲放行/configure 抢占被拒）；`test:mcp-handshake`、`npm run check`、`npm run process:check`（20 个活动 change）passed。
- 风险与后续：P1 已解决（p1Resolved=true）；P2（send_and_expect 等待、RX 缓冲端口隔离）待后续；COM10/COM11 端到端仍 blocked；真实设备未授权。本地提交 `66ddf31`（P1 修复），连同 `5fbd67b`（G3 审核）、`8b62774`（台账）共 3 个提交**推送 blocked**：连不上 github.com，待恢复后 `git push origin master`。
- 关联：`changes/add-mcp-server/`；本地提交 `66ddf31`。

## 2026-08-09 · L3 · review · add-mcp-server G3（conditionally-approved，P1=1/P2=2，未归档）

- 需求来源：用户要求对第 6 步 MCP Server 做 G3 独立审核。
- 方式：逐行核对 `mcp-server.js`（stdio 协议）与 `mcp-bridge.js`（转发/授权）；重跑握手与授权测试。
- 结论：`conditionally-approved`（P1=1/P2=2）。
  - **P1**：`open_connection`/`configure_connection` 复用全局 `serial.open`，会抢占/替换 Electron 主界面当前串口会话（SerialSession 单例），缺乏会话隔离。L3 安全边界下 MCP 打开端口可能干扰主会话，须约束后进入真实设备/归档。
  - **P2**：`send_and_expect` 发完立即读 RX 快照无等待，与 expect 语义不符；`read_data`/`send_and_expect` 的 RX 缓冲无端口隔离（全局缓冲）。
- 已核验：MCP stdio 协议正确、端口白名单强制（-32002）、方法白名单复用（-32001）、MCP 子进程无独立后端凭据、read_data 快照、白名单持久化；COM10/COM11 端到端仍 blocked。
- 风险与后续：P1 需实施者解决会话隔离；真实设备未授权；不得归档。本地提交 `5fbd67b` 已完成，**推送 blocked**：连不上 github.com（网络问题），待恢复后 `git push origin master`。
- 关联：`changes/add-mcp-server/`；本地提交 `5fbd67b`。

## 2026-08-09 · L3 · add-mcp-server（G3 ready-for-review，COM10/COM11 blocked，未归档）

- 需求来源：用户要求第 6 步实现 MCP Server（G1 决策：stdio 传输 + 端口白名单授权 + 默认关闭 + read_data 快照 + COM10/COM11 验证）。
- 范围：自研最小 MCP stdio 协议（无 SDK 依赖）；独立 Node 子进程 `mcp-server.js`；Main 侧 `mcp-bridge.js`（端口白名单持久化、复用 allowedRpcMethods+后端门面、read_data RX 快照缓冲）；main.js MCP 菜单/ipc handlers；preload 暴露启停。修复 G2 设计 P1（工具表矛盾）。
- 验证：`npm run test:mcp-handshake` passed（initialize/tools/list 7 工具/tools/call 转发/未知工具 -32602）；`npm run test:mcp-authorization` passed（白名单外 -32002/方法白名单外 -32001/read_data 快照/白名单持久化/缺 payload -32602）；`npm run check`、`npm run process:check`（20 个活动 change）passed。**COM10/COM11 端到端 blocked**：`Win32_SerialPort` 仅 COM3/COM4（蓝牙），ELTIMA 虚拟串口对未创建，无法收发验证。
- 风险与后续：改变安全边界，向外部进程暴露串口；自研 MCP 未验证真实 Claude Desktop/Cursor 客户端；COM10/COM11 端到端待虚拟串口恢复；真实物理设备未授权。L3 保持 ready-for-review（G3），不得自动归档。
- 关联：`changes/add-mcp-server/`；提交 `e1c1638`，推送 `origin/master`。

## 2026-08-09 · L2 · add-ai-command-generation（ready-for-review，未归档）

- 需求来源：用户要求继续第 5 步，AI 命令生成 + 宏库复用。
- 范围：后端注册 `ai.generateCommands`（经 AiAdapter 门面，未启用抛 not-enabled）；main 白名单加入；前端 `#page-protocol` 增加命令生成区（展示 name/HEX/description，每条可加入宏库复用）。mock 不联网、allowDataUpload 默认 false。
- 实现：`NamedPipeServer` 分发 ai.generateCommands；`main.js` 白名单；`index.html`/`renderer.js` 命令生成区 + 命令→宏映射（code 转 HEX、kind=write、同名覆盖）。
- 验证：`npm run test:ai-rpc` passed（generateCommands 未启用被拒/启用后返回 mock 命令）；`npm run test:protocol-ai-ui` passed（生成按钮、2 条命令、ReadDeviceInfo HEX 'AA 55 01'、加入宏库持久化）；三个 native tests passed（无回归）；`npm run build:backend`、`npm run check`、`npm run process:check`（19 个活动 change）均 passed。
- 风险与后续：真实网络 provider 与自然语言命令生成（F-013）为后续 L3；命令响应模板（F-014）留待后续。
- 关联：`changes/add-ai-command-generation/`；提交 `657b809`，推送 `origin/master`。

## 2026-08-09 · L2 · review · add-ai-provider-adapter / add-protocol-ai-parse（review-passed，未归档）

- 需求来源：用户要求对第 3、4 步两个 L2 变更包做独立只读审核。
- 方式：逐行核对 `AiAdapter` 门面与 `NamedPipeServer` ai.* 分发、main 白名单、前端校正 UI；重跑 `test-ai-rpc` 与 `test-protocol-ai-ui` 独立复现 evidence。
- 结论：均 `conditionally-approved`（P1=0）。
  - add-ai-provider-adapter P2=1：`ai.configure` 允许设置 `allowDataUpload=true`，接入真实需上传 provider 前须升级 L3 显式授权。
  - add-protocol-ai-parse P2=2：`ai.configure` 的 bool 强转报错不崩（建议明确校验）；校正 UI 仅自动化验证、mock 价值有限。
- 已核验：AiAdapter 门面强制授权无绕过；ai.* IPC 经门面、AiError 映射 JSON-RPC error、三层防线（main 白名单+knownMethod+门面）；前端 escapeHtml 防 XSS。
- 风险与后续：两包 `review-passed`，**不得自动归档**（AGENTS.md 要求人工确认）。推送已恢复，`origin/master` 同步至 `99944b6`。
- 关联：`changes/add-ai-provider-adapter/`、`changes/add-protocol-ai-parse/`；提交 `99944b6`。

## 2026-08-09 · L2 · add-protocol-ai-parse（ready-for-review，推送待恢复，未归档）

- 需求来源：用户要求继续第 4 步，规约文本→结构化配置 + 人工校正 UI。
- 范围：后端注册 `ai.status`/`ai.configure`/`ai.parseProtocol`（经 AiAdapter 授权门面，未启用抛 not-enabled）；main 白名单加入 ai.*；前端新增 `#page-protocol`（规约输入/AI 启用/解析渲染/字段校正/保存/导出）。不改串口 RPC 契约；mock 不联网、allowDataUpload 默认 false。
- 实现：`NamedPipeServer` 接入 `AiAdapter` 与 ai.* 分发（AiError 映射为 JSON-RPC error code）；`main.js` 白名单与 `Ctrl+6` 导航；`index.html`/`renderer.js` 新增规约页面与逻辑；`AiAdapter.cpp` 接入 backend 构建。
- 验证：`npm run test:ai-rpc` passed（ai.status/未启用拒绝/ai.chat 拒绝/configure/启用后解析）；`npm run test:protocol-ai-ui` passed（Electron UI 端到端：导航、启用、解析渲染 0xAA 0x55、两字段、校正保存 localStorage）；三个 native tests passed（无回归）；`npm run build:backend`、`npm run check`、`npm run process:check`（18 个活动 change）均 passed。
- 风险与后续：真实网络 AI provider 与上传为后续 L3；mock 解析价值有限；校正 UI 不同 DPI 视觉未覆盖。本地提交 `d77fedc` 已完成，**推送 blocked**：连不上 github.com:443（网络问题），待恢复后 `git push origin master`。
- 关联：`changes/add-protocol-ai-parse/`；本地提交 `d77fedc`。

## 2026-08-09 · L2 · add-ai-provider-adapter（ready-for-review，未归档）

- 需求来源：用户要求继续第 3 步，AI 适配层涉及数据上传授权边界。
- 范围：新增 `AiAdapter` 接口框架 + `MockAiProvider`（本地、不联网）+ 授权门面；**不接入 Named Pipe JSON-RPC、不实现真实网络 provider、默认不上传数据**，真实联网上传留待后续 L3 授权。不改 IPC 契约。
- 实现：`AiAdapter.{h,cpp}`（`AiProvider` 抽象/`AiAdapter` 门面/`MockAiProvider`/`AiError`/请求响应模型）；`AiAdapterTests.cpp`；CMake 注册 `serialscope-ai-adapter-tests`；创建 L2 变更包 `changes/add-ai-provider-adapter/`。
- 授权边界：`enabled=false` 抛 not-enabled；`allowDataUpload=false` 时 `requiresDataUpload()==true` 的 provider 抛 data-upload-denied；mock 恒允许（数据不出本机）。修复 `providerName` 悬垂引用警告。
- 验证：`serialscope-ai-adapter-tests.exe` passed（授权边界/mock 确定性/provider 选择/调用计数）；checksum/frame-decoder tests passed（无回归）；`npm run build:backend`、`npm run check`、`npm run process:check`（17 个活动 change）均 passed。真实网络 provider not-run（未授权，属后续 L3）。
- 风险与后续：真实网络 provider 与串口/AI 数据上传为后续 L3；IPC 暴露 ai.* 时须强制复用本门面，否则破坏数据边界。
- 关联：`changes/add-ai-provider-adapter/`；提交 `16bf3e6`，推送 `origin/master`。

## 2026-08-09 · L2 · review · add-checksum-engine / add-length-field-framing（review-passed，未归档）

- 需求来源：用户要求对第 1、2 步两个 L2 变更包做独立只读审核。
- 方式：逐行核对实现与四份文档；用 Python 独立核算标准向量（CRC8=0x48/CCITT=0x29B1/XMODEM=0x31C3/CRC32=0xCBF43926）确认非自洽错误；重跑 native 测试独立复现 evidence；用一次性临时 harness 验证测试未覆盖边界（帧头噪声 + 长度域偏移 offset=3，行为正确）。
- 结论：两包均 `conditionally-approved`（P1=0 / P2=2 各）。
  - add-checksum-engine P2：`fromName` 未知名静默返回 NONE（接入 JSON-RPC 时可能吞错）；CRC 参数固定默认。
  - add-length-field-framing P2：未校验 `lengthFieldOffset` 语义范围（offset<header.size() 时读到非预期字节）；测试未覆盖 minFrameSize 及非默认 offset 组合，payload 内伪 header 由后续规则层处理。
- 验证：`npm run process:check`（16 个活动 change）passed；无 lint 错误。
- 风险与后续：两包 `review-passed`，**不得自动归档**（AGENTS.md 要求人工确认）；推送已恢复，`origin/master` 已同步至 `f0d0e51`。
- 关联：`changes/add-checksum-engine/`、`changes/add-length-field-framing/`；提交 `f0d0e51`。

## 2026-08-09 · L2 · add-length-field-framing（ready-for-review，推送待恢复，未归档）

- 需求来源：用户提供的《AI 智能串口调试工具需求规划书 & 方案设计书》，F-008/F-010 要求按帧头特征码+长度域自适应分帧。
- 范围：扩展 `FrameDecoder` 新增 `FrameMode::Length`，支持 header 特征码 + 长度域动态帧长；不改 Raw/Delimiter/Fixed 既有行为，不改 Named Pipe JSON-RPC 契约。
- 实现：`FrameDecoder.{h,cpp}` 新增 `Length` 模式（header 定位、长度域读取、lengthIncludesHeader/lengthEndian/min/maxFrameSize、粘包/半包、超限丢弃后恢复、非法配置防御）；`FrameDecoderTests.cpp` 增补 Length 场景；创建 L2 变更包 `changes/add-length-field-framing/`。
- 验证：`serialscope-frame-decoder-tests.exe` passed（Length 完整帧/粘包/半包/includesHeader/大端/超限恢复/非法配置，Raw/Delimiter/Fixed 无回归）；`serialscope-checksum-engine-tests.exe` passed；`npm run build:backend`、`npm run check`、`npm run process:check`（16 个活动 change）均 passed。真实物理串口 not-run（未授权，纯解码）。
- 风险与后续：payload 内伪 header 误分帧留待 AI/规则层；Named Pipe 接入 length 配置留作后续 change。本地提交 `5dbf12d` 已完成，**推送 blocked**：连不上 github.com:443（网络问题），待恢复后 `git push origin master`。
- 关联：`changes/add-length-field-framing/`；本地提交 `5dbf12d`。

## 2026-08-09 · L2 · add-checksum-engine（ready-for-review，未归档）

- 需求来源：用户提供的《AI 智能串口调试工具需求规划书 & 方案设计书》，F-016/F-017/F-018 要求发送自动校验、接收自动验证、支持 CRC8/CRC16-Modbus/CRC32/校验和/XOR/LRC。
- 范围：新增 C++ 后端 `ChecksumEngine`（CRC8/CRC16-MODBUS/CRC16-CCITT/CRC16-XMODEM/CRC32/SUM8/SUM16_LE/SUM16_BE/XOR/LRC/NONE），提供 `calculate`/`append`/`verify`/`name`/`fromName`/`width`；注册 CMake 测试目标。不改 Named Pipe JSON-RPC 契约，不改现有 `crc16Modbus`/`appendModbusCrc`。
- 实现：`backend/src/ChecksumEngine.{h,cpp}`、`backend/tests/ChecksumEngineTests.cpp`、`backend/CMakeLists.txt`，并创建 L2 变更包 `changes/add-checksum-engine/`。
- 验证：`backend/build/serialscope-checksum-engine-tests.exe` passed（标准向量、append/verify round-trip 与篡改检测、与 crc16Modbus 一致性、NONE/非法类型/越界防御、名称与宽度映射）；`serialscope-frame-decoder-tests.exe` passed（无回归）；`npm run build:backend`、`npm run check`、`npm run process:check`（15 个活动 change）均 passed。真实物理串口 not-run（未授权，纯内部库不触碰串口）。
- 风险与后续：CRC 参数化本步固定默认；校验接入 Named Pipe 方法、自动填充/验证接入真实设备需后续单独 change 与授权。变更已提审，等待独立只读审核，不得自动归档。
- 关联：`changes/add-checksum-engine/`；提交 `43799b3`，推送至 `origin/master`。

## 2026-08-03 · L2 · 可执行通信测试工作台（implementing，未归档）

- 需求来源：用户确认将产品差异化聚焦为“设备通信联调与回归测试台”，并要求 React Flow 节点编排与宏协同。
- 实现：以 Vite + React 19 + React Flow 新增独立“通信测试工作台”窗口；流程支持宏发送、读取等待、HEX/文本/规则/变量条件、赋值、断言、延迟、最大次数/时长/间隔受控循环、取消、分支高亮、步骤耗时/消费报文报告、用例版本和宏快照；可写入 Modbus 模拟下位机配置并打开模拟窗口。既有主界面保持不变，迁移可回退。
- 验证：`npm run test:flow-runtime` passed（变量模板、条件、循环、失败结束和取消边界）；`npm run test:device-workbench` passed（ELTIMA COM10/COM11，宏发送→读取→HEX 分支→报告）；`npm run test:react-workbench-ui` passed（可见画布、节点加入、等待取消、版本保存、窗口缩放，截图 `artifacts/react-workbench-ui.png`）；`npm run check`、`npm run process:check` passed。
- 风险与后续：尚未覆盖人工拖拽编排和模拟下位机的双实例一键回归；当前 Windows/Electron 环境下 Vite ESM 与 `sandbox:true` 不兼容，工作台仅以 `contextIsolation + nodeIntegration:false + CSP` 运行，须单独消除该 P2；真实硬件未授权，严禁自动归档。
- 审核：独立只读终审 `conditionally-approved`（P1=0，P2=1）。Main 进程已强制绑定虚拟 COM10/COM11 或真实设备原生确认，并在每次写入重验端口和授权；P2 为 sandbox 例外及实际 Main 路由/React UI COM 端到端覆盖缺失。
- 关联：`changes/add-device-test-workbench/`、`changes/migrate-renderer-to-react/`。

## 2026-08-03 · L3 · 自动查询时序背压（review-passed，未归档）

- 需求来源：用户提供的 CSV 显示极限周期查询时 TX/RX 时序积压，授权改为请求—应答调度。
- 实现：自动发送由无等待 `setInterval` 改为单在途链式调度；每轮具有不可变令牌，超时从提交发送时开始，旧轮回调不能影响新轮；每轮在第一帧 RX 或超时后才发起下一轮，最小周期支持 10 ms；日志导出新增毫秒时间与顺序号（包括系统日志）。
- 验证：`npm run test:auto-query-backpressure-ui` passed（生产 Electron + COM11，10 ms / 30 ms 无应答超时，至少进入第二轮且在途数始终不超过 1）；`npm run test:auto-query-timing` passed（COM10 持续原生应答，至少 20 往返后关闭自动发送，TX=RX=应答器计数，单在途）；`npm run test:log-export-contract` passed；静态/流程检查 passed。`npm run test:production-simulator` failed（独立串口配置窗口的脚本化缩放断言未生效，未进入模拟器阶段）。
- 风险与后续：泛型模式不能关联规约级应答；串口配置窗口的原生缩放自动化另行修复。真实硬件未授权，严禁自动归档。
- 审核：独立只读终审 conditionally-approved（P1=0，P2=1）；无应答 30 ms 超时可安全进入下一轮，单在途令牌隔离成立。P2 为 serial-config 脚本化缩放回归失败，另行修复，不能宣称全量回归全绿。
- 关联：`changes/serialize-auto-query-timing/`。

## 2026-08-03 · L1 · 主工作区去冗余化

- 需求来源：用户要求移除主页面中占用空间、非必须直观观察的按钮与统计卡片。
- 范围：移除主页面按钮工具栏与四张指标卡；保留原生菜单中的全部串口操作、顶部连接状态与累计 RX/TX/帧数，以及工作区内的发送操作。
- 验证：`npm run test:production-simulator` passed（生产 Electron 前端自动化断言主窗口移除冗余工具栏/指标卡、配置窗口与全部独立模块流程可用，并完成 COM10/COM11 模拟器唯一应答）；`npm run check`、`npm run process:check`、`git diff --check` passed。
- 残余风险：仅自动化验证布局与功能可达性；不同 DPI 下的主窗口人工视觉体验仍未覆盖。

## 2026-08-02T00:00:00Z · archive · initialize-ai-development-framework

- 需求来源：用户提供的《AI 开发框架：项目无关实践系列》并要求初始化本项目。
- 范围：根 Agent 约束、风险/生命周期/审核文档、L2/L3 change 模板、过程检查器、workflow 与台账入口；不改产品运行时逻辑。
- 实现：创建可解析的 `change.json` 与 `evidence.md` JSON 证据约定，并在 `package.json` 注册 `process:check`。
- 验证：`npm run process:check` passed；`npm run check` passed；真实串口硬件验证 not-run（无授权且非本次范围）。
- 风险与后续：归档包目前仍参与过程检查；后续框架维护 change 应确定归档过滤策略。产品优化从独立 change 开始。
- 关联：`changes/initialize-ai-development-framework/`；`changes/initialize-ai-development-framework/evidence.md`；`changes/initialize-ai-development-framework/archive.md`。

## 2026-08-02T00:00:00Z · archive · stabilize-data-path

- 需求来源：项目审计后，用户要求执行项目优化。
- 范围：WebSocket 有界传输与消息分级、命令容错、Renderer 重连与渲染节流；不包含串口帧拆包或模块化重构。
- 实现：控制消息优先队列与实时 RX/TX 限流，严格 payload 校验，单一连接调度器，日志合帧及 profile/统计容错。
- 验证：`npm run build:backend` passed；`npm run check` passed；`npm run process:check` passed；畸形协议及 COM10/COM11 双向收发 passed；慢客户端压力 blocked。
- 风险与后续：帧边界仍未定义；下一 change 处理字节流缓冲与可配置拆包。Electron/真实物理串口验证尚未完成。
- 关联：`changes/stabilize-data-path/`；`changes/stabilize-data-path/evidence.md`；`changes/stabilize-data-path/archive.md`。

## 2026-08-02T00:00:00Z · archive · add-delimiter-framing

- 需求来源：项目优化阶段中，修复读取块被误作为完整帧的问题。
- 范围：raw/分隔符帧模式、1 MiB 有界缓冲、自定义 HEX 分隔符和 Renderer 配置；不含定长、空闲超时或长度字段。
- 实现：固定数组帧缓冲，超限帧丢弃至结束符后恢复；C++ 原生测试覆盖阈值与恢复，COM10/COM11 覆盖粘连/拆分、raw 默认和非法 HEX。
- 验证：`npm run build:backend`、`serialscope-frame-decoder-tests.exe`、`npm run check`、`npm run process:check` passed；真实物理串口 not-run。
- 风险与后续：GUI/CSerialPort 时序未验证；下一 change 增加定长、空闲超时和长度字段策略。
- 关联：`changes/add-delimiter-framing/`；`changes/add-delimiter-framing/evidence.md`；`changes/add-delimiter-framing/archive.md`。
# 2026-08-03：桌面端启动兼容性（L1）

- 变更：在 `src/main/main.js` 中禁用硬件加速，并将 GPU 进程置于主进程内，避免部分 Windows 环境因 Chromium GPU 子进程缺失运行库而在创建窗口前退出。
- 验证：`npm run check` 通过；`npm run process:check` 通过；`npm run dev` 已连续运行超过 5 秒且未再出现 GPU 致命退出（随后主动结束测试进程）。
- 残余风险：尚未在具有可用 GPU 驱动的实体桌面环境进行窗口渲染目视验证；本工具的日志和图表在软件渲染下可能有更高 CPU 占用。

# 2026-08-03：Named Pipe + JSON-RPC 迁移准备（L3，blocked）

- 变更：创建 `changes/migrate-named-pipe-json-rpc`，将本地后端 IPC 迁移定义为 Windows Named Pipe、JSON-RPC 2.0、4 MiB 有界帧、Owner SID DACL、远程拒绝、单客户端和启动 ready 握手。
- 审核：独立只读审核判定原 L2 设计 `rejected`，原因是 IPC 安全边界和多阶段编排必须为 L3；变更已升级为 L3 / Mode P 并停止自动推进。
- 依赖：`vcpkg install json-rpc-cxx:x64-windows` 被本机代理 TLS 错误 35 阻断；设计保留 nlohmann JSON 的可替换 dispatcher fallback，未声称已接入该库。
- 验证：`npm run process:check` 通过（5 个变更包）；`git diff --check` 通过（仅输出已有文件的换行符警告）。
- 残余风险：须经 L3 人工闸门后才能开始实现；旧 `add-fixed-length-framing` 因 WebSocket 最大帧端到端验证未通过保持 `blocked`，由新传输层重新验收，不能自动归档。

# 2026-08-03：Named Pipe + JSON-RPC 阶段 1（待独立审核）

- 变更：新增 C++ `NamedPipeServer`，使用 `\\.\pipe\SerialScope.Native.<UUID>`、4 字节小端长度前缀、4 MiB 上限、Owner-only 受保护 DACL、远程客户端拒绝与单客户端实例。删除后端 TCP/WebSocket 监听代码。
- Electron：新增 Main 进程 `NamedPipeRpcClient`，启动后端时生成管道名，通过 `backend.ready` 和 `backend.ping` 建立并验证双向 RPC 基础；Preload 暴露受限 `callBackend` 接口。
- 验证：`npm run build:backend`、`npm run test:named-pipe`、`npm run check`、`npm run process:check` 均通过。
- 残余风险：串口 RPC 与 Renderer 尚未迁移，不能将当前中间态作为完整 GUI；跨用户 ACL、4 MiB 边界与 COM10/COM11 在阶段 2 验证。

- P1 修复：JSON-RPC 支持 batch 和数组 params，未知方法返回标准 `-32601`；DACL 从实际 TokenUser SID 构造并在传入 Win32 前回读验证；Main 客户端强制等待 `backend.ready` 并在失败时终止后端；超限/不可写出站消息断开客户端而不静默丢弃。
- 独立审核：`conditionally-approved`（仅 L3 阶段 1，P1=0）。阶段 2 前仍需获得人工闸门，并补齐实际 Pipe 对象 DACL/跨用户/跨会话、第二客户端、慢客户端和精确 4 MiB 出站边界的验证设计与授权。

# 2026-08-03：Named Pipe + JSON-RPC 阶段 2（blocked）

- 变更：Renderer 已改由 Preload 的受限 `callBackend` 调用 `ports.list`、`serial.open/close/send`，并把 Main 转发的 JSON-RPC notifications 映射回原有串口状态和收发日志。
- 验证：Renderer 开发启动持续超过 5 秒；Named Pipe 基础测试通过。直接 Win32 写 COM10、读 COM11 的 ELTIMA 虚拟对通过。
- 失败：经 Named Pipe 打开 COM10 后，CSerialPort 4.3.3 的 `serial.send` 返回成功但 Win32 COM11 读取器无数据；COM11 原生写入也未产生 `serial.rx`。异步/同步模式均复现，已恢复异步模式，不将失败表述为通过。
- 残余风险：当前 L3 change 保持 blocked。需替换/升级 CSerialPort，或实现经验证的 Win32 串口后备层后，才可重新验证 COM10/COM11、定长最大帧与后续模拟下位机功能。

# 2026-08-03：CSerialPort v5 数据面修复（L3，待独立审核）

- 变更：将 vcpkg 的 CSerialPort 4.3.3 替换为仓库锁定的 v5.0.0.260619 源码静态构建；异步接收改为等待 `EV_RXCHAR`，并采用非阻塞 Named Pipe 请求轮询，使 Asio 串口通知不会被同步管道读取占用。
- 验证：`npm run build:backend`、`npm run test:named-pipe`、`npm run check`、`npm run process:check` 均 passed；实测 Named Pipe `serial.send` 从 COM10 到 COM11 收到 `CA FE`，以及 COM11 写入 `41 42` 后收到 `serial.rx` notification。
- 审核：阶段 2 独立只读审核结论 `conditionally-approved`（P1=0），并独立复现两向虚拟串口路径。
- 风险与后续：跨用户 DACL、第二客户端、慢客户端与精确 4 MiB 出站边界尚未验证；`test:named-pipe-serial` 仍受 Defender 阻断的子 PowerShell 影响；README 尚有旧 WebSocket 描述；最大 fixed 帧须在新数据面单独验收。变更处于 `ready-for-review`，不得自动归档或推进模拟下位机、独立窗口和宏功能。
- 关联：`changes/migrate-named-pipe-json-rpc/`；`changes/migrate-named-pipe-json-rpc/evidence.md`。

## 2026-08-03T05:00:00Z · pending-review · migrate-named-pipe-json-rpc

- 需求来源：用户追加最大定长帧、4 MiB、慢客户端、ACL、原生虚拟串口辅助程序和 README 收口目标。
- 范围：Named Pipe JSON-RPC 传输、CSerialPort v5 虚拟串口验证与文档；不包含真实硬件发送。
- 实现：定长读取缓冲扩大至 128 KiB；写入改为 2 秒限时 overlapped I/O；实现同 SID 跨 Windows 会话拒绝与读/断开句柄同步；新增原生虚拟串口/慢客户端/第二客户端辅助程序。
- 验证：`npm run build:backend`、`test:named-pipe-outbound-boundary`、`test:named-pipe-fixed-frame`、`test:named-pipe-single-client`、`test:named-pipe-serial` passed；跨用户和跨会话实际拒绝 not-run（缺少第二 Windows 会话和可用第二用户凭据）。
- 风险与后续：真实硬件设备、连接参数和安全发送授权未提供；L3 保持 implementing，不得自动归档。
- 关联：`changes/migrate-named-pipe-json-rpc/`；`changes/migrate-named-pipe-json-rpc/evidence.md`。

## 2026-08-03T05:00:00Z · pending-review · add-standalone-windows-and-macro-editor / add-device-simulator

- 需求来源：用户要求子模块独立窗口、宏编辑保存执行及模拟下位机。
- 范围：Electron 多窗口、宏本地持久化和 COM10/COM11 模拟下位机；不把虚拟串口结果称为真实硬件验证。
- 实现：五个模块可独立打开并复用 Main 的单一 Pipe 客户端；宏可新建/编辑/删除/执行；模拟器支持 Echo、AT、Modbus 03/04/06/16、自定义 HEX 规则、随机模板和唯一多窗口执行权。
- 验证：`npm run test:electron-ui` passed，覆盖可见窗口、COM10/COM11 双向收发、宏执行、独立宏窗口、自定义和 AT 模拟回复；`npm run test:production-simulator` passed，生产 Main/sandbox=true 下逐项打开五个模块窗口，独立模拟窗口接管后由原生辅助程序继续读取 250ms 并确认无重复回复，关闭后主窗口恢复；`npm run check` passed。
- 风险与后续：Modbus 为调试子集；所有自动串口测试使用 ELTIMA 虚拟端口。两个 L2 change 均待独立只读审核，不得自动归档。
- 关联：`changes/add-standalone-windows-and-macro-editor/`、`changes/add-device-simulator/`。

## 2026-08-03T05:30:00Z · pending-review · adopt-desktop-menu-toolbar

- 需求来源：用户指出当前页面内导航过多，要求采用桌面应用菜单栏与工具栏。
- 范围：Windows Electron 菜单、顶部高频工具栏与侧栏减负；不改变串口 RPC 或默认写入授权。
- 实现：Main 创建文件、视图、串口、窗口、帮助菜单；经受限 Preload `ui:action` 驱动主窗口。页面内导航和独立窗口按钮移至菜单，工具栏保留启动、刷新、打开、关闭和发送。
- 验证：`npm run check`、`npm run test:electron-ui`、`npm run process:check` passed；实际窗口已目视显示菜单栏与工具栏，截图 `artifacts/production-menu-toolbar.png`。
- 风险与后续：原生菜单的逐项人工点击和真实物理串口仍待验收；L2 变更待独立只读审核，不得自动归档。
- 关联：`changes/adopt-desktop-menu-toolbar/`。

- 审核更新：`add-standalone-windows-and-macro-editor`、`add-device-simulator`、`adopt-desktop-menu-toolbar` 均获独立只读 `conditionally-approved`（P1=0），已标记 `review-passed`；仍不得自动归档。

## 2026-08-03T06:00:00Z · implementing · validate-visible-ui-and-hardware

- 需求来源：任务目标要求完成可见桌面 UI 完整交互验收与真实硬件串口验证。
- 实现与验证：`npm run test:electron-ui` 及生产 Main/sandbox=true 的 `npm run test:production-simulator` 均 passed；后者逐项打开五个独立模块窗口，并用 COM10/COM11 验证模拟器唯一回复与恢复。
- 真实硬件发现：经授权只读 `Get-CimInstance Win32_SerialPort` 只发现 COM3/COM4 蓝牙串行服务，未发现可安全测试的物理设备；未向其发送数据。
- 风险与后续：需要用户提供/连接物理设备、连接参数、无副作用探测报文及明确写入授权；L3 仍为 implementing，禁止归档。
- 关联：`changes/validate-visible-ui-and-hardware/`；`changes/validate-visible-ui-and-hardware/evidence.md`。

## 2026-08-03T06:15:00Z · pending-review · extract-serial-config-window

- 需求来源：用户要求把串口设置从主页面移至独立窗口。
- 实现：连接参数与分帧设置成为 `serial-config` 独立窗口；主窗口工具栏和“串口”菜单打开配置窗口。串口草稿经 localStorage 在窗口间同步，实际打开仍由配置窗口调用既有 `serial.open`。
- 验证：`npm run test:production-simulator` passed，断言主页面无连接参数面板，配置窗口以 COM11/9600 打开后状态和草稿同步至主窗口，并继续通过 COM10/COM11 交互；`npm run test:electron-ui` passed。
- 风险与后续：并发编辑最后保存者覆盖；真实硬件仍未授权。L2 待独立审核，不得自动归档。
- 关联：`changes/extract-serial-config-window/`。

- 审核更新：独立只读审核 `conditionally-approved`（P1=0），已标记 `review-passed`；不得自动归档。

- 后续修复：禁止独立窗口将其页面写入主窗口布局；若旧布局记录 `page-serial-config`，主窗口强制回到 terminal。`serial-config` 专用 body 隐藏侧栏、总工具栏和指标区；实际 Ctrl+Shift+O 打开轻量独立窗口，截图 `artifacts/production-minimal-serial-config.png`。变更重新进入 `ready-for-review`，不得自动归档。

## 2026-08-03T06:30:00Z · pending-review · validate-resizable-module-windows

- 需求来源：用户要求各子模块窗口可调整大小，并要求使用前端自动化验证。
- 实现：显式设置 BrowserWindow `resizable: true`、`maximizable: true`；生产 CDP 测试以 Renderer `window.resizeTo` 调整并用 `outerWidth/outerHeight` 回读六种模块窗口尺寸。
- 验证：`npm run test:production-simulator` passed；serial-config、terminal、trend、rules、macros、simulator 均在调整后保持目标页面与后端连接。
- 风险与后续：未替代不同 DPI 下用户拖动边框的主观体验验收；L2 待独立审核，不得自动归档。
- 关联：`changes/validate-resizable-module-windows/`。

- 审核更新：独立只读审核 `conditionally-approved`（P1=0）；设计文档改为实际的 Renderer `window.resizeTo` 自动化，已标记 `review-passed`，不得自动归档。

## 2026-08-03T16:52:00Z · implementing · add-device-test-workbench

- 变更：为通信测试工作台补齐“启动第二个模拟实例”的 Main 端口登记契约。`ports.list` 的真实 `{ ports: [...] }` 返回现由共享校验器解析，父进程启动前与子进程自动开口前都会核验 COM10 的 ELTIMA Virtual Serial 身份。
- 验证：`npm run test:virtual-simulator-port`、`npm run check`、`npm run test:workbench-authorization`、`npm run test:flow-runtime`、`npm run test:react-workbench-ui`、`npm run process:check` 均通过。
- 风险与后续：当前自动化会话仍不能稳定启动第二 Electron（Renderer process launch-failed），所以完整双实例 COM10/COM11 占用与收发未声称通过；工作台的 sandbox=false 兼容性例外和真实硬件执行也仍待验收。L2 保持活动，重新独立审核前不得归档。

- 审核更新：独立只读复审 `conditionally-approved`（P1=0 / P2=1）。Main 已正确处理 Native `ports.list` 的对象返回并阻断未登记端口；双 Electron 端到端和 sandbox=false 例外仍是残余 P2，变更标记 `review-passed`，不得自动归档。

## 2026-08-04T00:30:00+08:00 · implementing · add-device-test-workbench

- 变更：双实例模拟下位机改用隔离的临时 userData Profile，并在退出、启动错误、窗口关闭或应用退出时清理；30 秒未就绪会终止子实例并允许重试。启动阶段向工作台反馈渲染器、后端与 ELTIMA COM10 校验进度。模拟器对 raw 接收块使用 8 ms 空闲、24 ms 绝对截止和 64 KiB 上限聚合，避免半帧与无界增长。
- 验证：`npm run test:workbench-dual-simulator` passed，以可见 React 工作台和 Native COM11 启动第二 Electron 实例的 COM10 模拟器，实测分段 Modbus 请求仍获得应答、RX、通过报告，并读取持久化的流程/宏/步骤/消费帧快照；并已重跑 `check`、flow、授权、端口、UI、设备工作台及过程检查，均通过。
- 风险与后续：真实硬件仍未授权；生产 Main 菜单/IPC 到工作台的 CDP 全路径未覆盖。raw 模式相邻独立报文仍可能被短窗口合并，应选确定性分帧。工作台和独立模拟实例仍为 sandbox=false 兼容性例外，保持 contextIsolation、禁用 Node 与 CSP；等待独立复审，不得归档。

- 审核更新：独立只读复审 `conditionally-approved`（P1=0 / P2=1）。30 秒启动超时、子实例 Profile 清理、24 ms/64 KiB 聚合边界及报告快照验证已通过；保留 sandbox=false、raw 聚合语义及生产 Main 菜单/启动器全路径 E2E 的残余 P2，不得归档。

## 2026-08-04T02:05:00+08:00 · implementing · add-device-test-workbench

- 完成度审计修复：Native 收发事件新增单调 `sequence`，报告能精确标注消费 RX；React 工作台新增可编辑规则库并把命中写入帧/条件/断言；循环触及次数或时长边界立即 failed，后续写入不可达。
- 宏与复现：宏改为稳定 ID、版本、查询/写入类别和 HEX/文本载荷；流程保存多版本，报告仅快照实际宏并可重放；界面显示等待条件、步骤时序、分支、消费帧和失败原因，支持 JSON/CSV/HTML 导出。
- 验证：`build:backend`、`test:flow-runtime`、`test:react-workbench-ui`、`test:device-workbench`、`test:workbench-dual-simulator`、授权/端口、`check` 与 `process:check` 均通过。等待独立复审，真实硬件未授权，不得归档。

## 2026-08-04T01:06:53+08:00 · review-passed · add-device-test-workbench

- 深化：宏节点现在只能引用宏库项，报文编辑归属“写入”节点；旧内联宏迁移为写入节点。报告仅在实际发送成功后追加宏快照，失败报告保留此前已执行宏。规则真分支、宏 v3 快照及报告重放后的二次 COM11↔COM10 执行均已端到端验证。
- 验证：`test:flow-runtime`、`test:react-workbench-ui`、`test:workbench-dual-simulator`、`build:backend`、`test:device-workbench`、授权/端口、`check` 和 `process:check` 通过；独立只读审核为 conditionally-approved（P1=0/P2=2）。
- 残余：真实硬件未授权；工作台/子模拟器 `sandbox=false`；生产 Main 菜单/IPC/授权器完整 CDP 路径及 raw 相邻帧不可合并性未覆盖。保持活动，禁止自动归档。

## 2026-08-04T01:30:00+08:00 · implementing · validate-visible-ui-and-hardware

- 用户授权在 COM11 的 Modbus Slave 模拟下位机执行条件读写。SerialScope 后端从配对端 COM10 以 115200 8N1、无校验/无流控发送 03 查询寄存器 0；收到并 CRC 校验值 100 后，发送 06 将寄存器 1 写为 101，收到写入回显确认。
- 安全边界：脚本固定绑定本次 COM10↔COM11、115200 8N1、从站 1 的授权场景，并要求两个明确确认标志；只有 03 返回值严格等于 100 时才会发送 06。03 读应答异常阻止写入；06 已发后的回显异常仅报告未确认并关闭，不能误称“未写入”。
- 验证：`node scripts/authorized-modbus-register-flow.js --authorized-com10-to-com11-modbus-slave --confirm-write-register-1-101` passed；此为模拟设备，不替代真实物理串口验证。L3 保持活动，不得自动归档。

- 后续安全收紧：脚本固定本次端口/参数、加双确认、有界 RPC、内层 finally 清理与 TX/RX 序号围栏；`node scripts/test-authorized-modbus-register-flow.js` 已验证旧帧和 CRC 错误帧不会被误关联。为避免第三次重复写 101，最终安全收紧版本未再次向模拟 Slave 发 06；L3 证据如实记录该范围。

- 审核：独立只读复核 conditionally-approved（P1=0/P2=2）。P2 为最终安全收紧版未再次执行外部 06、以及未刻意演练外部 Slave 的异常应答；COM11 模拟 Slave 不构成物理设备验收。L3 保持 implementing，禁止归档。

## 2026-08-04T02:20:00+08:00 · review-passed · add-device-test-workbench

- 结构化条件：工作台的读取、条件和断言节点新增 Modbus 03/04 寄存器判定（从站、功能码、起始/目标地址、字段类型和数值比较）、任意二进制协议的零基字节偏移字段、文本正则；默认节点标题随条件切换同步，避免仍显示“HEX 匹配”。
- 安全：Modbus 条件要求非零偶数字节数、精确 RTU 长度及 CRC16 正确，越界、截断、CRC 错误、未知类型和无效正则均为 false，不能放行写入分支。
- 验证：运行时覆盖 03/04、U16/I16/U32/float、坏/缺 CRC、未知类型、字节越界和正则；可见 UI 验证全字段持久化；COM10/COM11 验证实际寄存器字段分支；双实例、语法和过程检查通过。独立复核 P1=0/P2=1；病态但语法正确的正则性能限制仍待后续强化，禁止归档。
