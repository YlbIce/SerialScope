# SerialScope：把工业串口调试做成可编程的工程工具

> 本文用一份超过两万字的篇幅，完整复盘 SerialScope Native（SerialScope-BoostElectron）这个串口调试上位机的全部能力、技术实现细节和设计取舍。读者既可以把它当作一份产品说明书，也可以当作一份技术决策复盘。
>
> 文末附所有功能截图，均由 Electron 自动化脚本在可见窗口下截取；代码片段全部来自 `d:\WORKSPACE\Electron\SerialScope-BoostElectron` 的当前实现。

---

## 〇、写在前面：为什么是"另一个串口工具"

我接触串口调试工作开始得很早——从最早的「串口猎人」到 `SecureCRT`，再到后来我用过的 SSCOM、VOFA+、XCOM、友善串口调试助手。这一类工具的共同特点是：

1. **单进程一体式**——UI 和硬件逻辑挤在同一个进程里；
2. **面向"看波形和发命令"**——只解决收、发、HEX/文本切换这几件事；
3. **能力是"用完即弃"的**——关掉窗口后，所有串口会话、自定义协议解析、自动化脚本都消失了。

当我自己开始写工具脚本、搭测试台、维护回归用例时，我就越来越觉得这些工具**不够工程化**。我想要的串口工具是这样的：

- 它能把**规约文本**直接解析成结构化的帧定义；
- 它能识别一份**Excel 点表**然后自动生成 Modbus 命令；
- 它能让我把一串收发流程**编排成可重放的工作流**；
- 它能在无人值守的 CI / 自动化产线里**作为后端被调用**；
- 它能**保证收到的字节确实是发出去的字节**——也就是 CRC、长度域、分隔符这些校验都能在本地完成，不依赖人眼对屏。

但更重要的是：

- 它不能把**真实物理设备的串口数据**默认就上传到云端；
- 它不能在我写错一个字节的时候**静默地发出去**；
- 它不能在我以为只是在本地调试的时候**悄悄打开了第二个窗口收发数据**。

SerialScope 这个项目不是为了再做一个"串口调试助手"——它想要回答一个更朴素的问题：

> **能不能把串口调试做成一个可以像代码一样被审视、被版本化、被自动化的工程工具？**

围绕这个目标，过去几个月里我和协作者把这套工具从最初的 WebSocket + Electron 雏形，一路演化到今天这个版本：Electron 39 + C++20 独立后端 + Named Pipe JSON-RPC + AI 规约解析 + React Flow 通信测试工作台 + MCP Server 桥接。本文按功能模块逐一展开。

---

## 一、整体架构：一条管道串起三层

### 1.1 进程拓扑

整个工具由三类进程组成，三类进程之间用 **当前 Windows 用户专属的命名管道（Named Pipe）+ JSON-RPC 2.0** 通信：

![框架图 - diagram-01](./artifacts/blog/diagram-01.png)

### 1.2 为什么是这种架构

**为什么是 Electron 主进程 + C++ 子进程，而不是直接在 Electron 里调 Node addon？**

- 串口操作的可靠性、字节级时序精度，是被各种 Node serialport 实现踩过坑的（`@serialport/bindings-cpp` 在不同 Windows 版本下丢字节、阻塞读、CPU 占用高等问题）。把串口 I/O 放进一个独立的 C++ 进程，意味着：
  - Electron 主进程崩溃时，串口后端不会被一起带走；
  - 调试 UI 不会阻塞底层字节收发；
  - 整个后端可以被其它非 Electron 的进程独立调用（这是后面 MCP Server 桥接的基础）。

**为什么是 Named Pipe 而不是 TCP / Unix Domain Socket？**

- Windows 平台上 Named Pipe 是最直接可用的本地 IPC。
- Named Pipe 自带**当前用户 DACL 安全模型**——`D:P(A;;GA;;;<当前用户SID>)`，天然支持"只有我能用"。
- `PIPE_REJECT_REMOTE_CLIENTS` 标志可以拒绝跨机器访问。
- 不需要端口号，避免被防火墙或端口占用问题打断。
- 整个 IPC 不开 TCP 监听端口，攻击面小，逆向门槛高。

**为什么是 JSON-RPC 2.0 而不是自定协议？**

- JSON-RPC 2.0 是工业里被反复验证的轻量 RPC 协议，方法、参数、错误码、id、批量、通知全都齐了。
- 框架不引入第三方 RPC 库，自己用 `nlohmann/json` 加上 4 字节小端长度前缀实现就够——消息最大 4 MiB，写超时 2 秒，单客户端。
- 后续如果要切到 gRPC / Protobuf，Main 侧的 `NamedPipeRpcClient` 包装层就是天然的迁移边界。

### 1.3 渲染进程内部的"双前端并存"

值得一提的一个工程现状是：**渲染层目前是"双前端并存"**：

- **原生 JS（`src/renderer/renderer.js`，约 96KB）**：承担主窗口的 6 个页面（terminal / trend / rules / macros / simulator / protocol）。这是项目最早期就有的代码，没有框架依赖，纯 HTML+CSS+JS。
- **React 19 + Vite 7 + @xyflow/react**（`src/renderer-react/`）：只承担一个独立模块——通信测试工作台。`src/main/main.js` 在 `moduleId === 'workbench'` 时加载 `renderer-dist/index.html`，其余模块加载原生渲染器。

这种"老界面保持原样、新功能用新栈"的策略是有意为之：

- 避免一次大重写带来的回归风险；
- 让 React 工作台以独立窗口的方式上线，不污染主界面；
- 等工作台稳定后再考虑把原生页面逐步迁移。

---

## 二、C++ 后端：四个文件办四件事

### 2.1 文件清单与职责

| 文件 | 职责 |
|---|---|
| `backend/src/main.cpp` | 入口：解析 `--pipe` 参数，启动 Asio `io_context` 与 `NamedPipeServer` |
| `backend/src/NamedPipeServer.cpp/.h` | Named Pipe + JSON-RPC 服务核心，单客户端，DACL 安全 |
| `backend/src/SerialSession.cpp/.h` | CSerialPort v5 封装、异步读取、分帧、统计、Modbus CRC |
| `backend/src/FrameDecoder.cpp/.h` | 四种分帧模式（raw/delimiter/fixed/length-field） |
| `backend/src/ChecksumEngine.cpp/.h` | 校验引擎 CRC8 / CRC16 Modbus / CRC16 CCITT / CRC16 XMODEM / CRC32 / SUM8 / SUM16LE / SUM16BE / XOR / LRC |
| `backend/src/AiAdapter.cpp/.h` | AI Provider 抽象 + Mock Provider + 授权门面 |
| `backend/src/ProtocolUtils.cpp/.h` | 字节/HEX/文本转换、Modbus CRC、UTF-8 净化、时间戳 |

整个后端用 **CMake + vcpkg + C++20** 构建，依赖最小：

![代码片段（cmake） - code-02](./artifacts/blog/code-02.png)

### 2.2 `NamedPipeServer`：当前用户、单客户端、DACL 严格

管道命名：`\\.\pipe\SerialScope.Native.<UUID>`，UUID 在每次启动时生成，避免历史管道残留。

**安全模型**：
- SDDL 字符串 `"D:P(A;;GA;;;<当前用户SID>)"`：把 DACL 锁到当前 Windows 用户的 SID；
- `PIPE_REJECT_REMOTE_CLIENTS`：拒绝任何远程客户端；
- `isCurrentSessionClient()`：再用 TokenUser SID 比对一次，确保客户端和服务器在同一个 Windows 会话中（避免同一用户在不同会话里互相影响）；
- `CreateNamedPipeW` 的实例数设为 1，配合 `FILE_FLAG_FIRST_PIPE_INSTANCE`，单客户端独占。

**消息帧协议**：每条消息 = 4 字节小端长度前缀 + JSON 体，最大 4 MiB，写超时 2 秒。重叠 I/O 避免阻塞。

**JSON-RPC 2.0 分发**：`dispatchSingle()` 检查 `jsonrpc==2.0`，按 `method` 路由到白名单方法：

![框架图 - diagram-03](./artifacts/blog/diagram-03.png)

错误码采用标准 JSON-RPC：`-32700` 解析错误、`-32600` 非法请求、`-32601` 方法不存在、`-32602` 非法参数、`-32000` 服务器错误。`AiError` 的 code 拼入 data。

**串口方法在 Asio 线程执行**：通过 `asio::post` + `std::promise/future` 同步等待，保证 `SerialSession` 的线程安全——读事件来自 CSerialPort 内部线程，必须转投回 Asio 主循环。

**通知**：服务器主动推送 `serial.state` / `serial.error` / `serial.rx` / `serial.tx`，用 `type 中 : 转 .` 的命名风格。

### 2.3 `SerialSession`：CSerialPort v5 + 分帧 + 统计

`SerialSession` 继承 `std::enable_shared_from_this` + 私有实现 `itas109::CSerialPortListener`，持有 CSerialPort 实例、`FrameDecoder`、4 KiB 读缓冲。

**打开串口（`open()`）**：
- 解析并校验配置：波特率 110 ~ 4,000,000；dataBits 5 ~ 8；parity/stopBits/flowControl 映射；
- 设置异步模式；
- `setReadIntervalTimeout(0)` + `setMinByteReadNotify(1)` + `setByteReadBufferFullNotify(1)`：保证及时拿到 `EV_RXCHAR`，不因超时等待而漏字节；
- 连接读事件。

**发送（`sendPayload()`）**：支持 text/hex 模式、行尾（none/CR/LF/CRLF），可追加 Modbus CRC16；单次发送上限 1 MiB。

**读事件路径**：
![框架图 - diagram-04](./artifacts/blog/diagram-04.png)

**统计**：rxBytes / txBytes / frames / uptime（暴露在 `stateJson()`）。

**为什么用 CSerialPort v5 替换 vcpkg 的 4.3.3？** 在早期 ELTIMA 虚拟串口 COM10/COM11 的双向测试中，4.3.3 表现为 `serial.send` 返回成功但 `EV_RXCHAR` 收不到。换上 v5.0.0.260619 源码静态构建后立即正常。这是一个**真实工程教训**：选型时要把"能在自家测试环境里跑通"作为硬指标。

### 2.4 `FrameDecoder`：四种分帧模式

![框架图 - diagram-05](./artifacts/blog/diagram-05.png)

每种模式都做了**超限/越界/非法配置的防御**：长度域越界、min > max、非对齐、超出环形缓冲（固定 1 MiB）后丢弃到结束符后恢复。`FrameDecoderTests.cpp` 覆盖每种模式的粘包/半包/超限恢复。

### 2.5 `ChecksumEngine`：十一种校验

![框架图 - diagram-06](./artifacts/blog/diagram-06.png)

支持 `calculate` / `append` / `verify` / `name` / `fromName` / `width`。`ChecksumEngineTests.cpp` 跑了标准向量：

![框架图 - diagram-07](./artifacts/blog/diagram-07.png)

这些向量后来在 Python 里独立核算过一次，确认实现不是自洽错误。

### 2.6 `AiAdapter`：授权门面与 Mock

![代码片段（cpp） - code-08](./artifacts/blog/code-08.png)

`MockAiProvider` 在本地返回硬编码的解析结果（header `{0xAA, 0x55}`）和 mock 命令列表，不联网，不上传任何字节——这正是 L3 场景下"未授权 provider 时的安全回退"。

---

## 三、Electron 主进程：窗口、IPC、AI、MCP、授权

### 3.1 启动与窗口管理

`src/main/main.js` 负责：

- `disableHardwareAcceleration()` + GPU 进程内联：在部分 Windows 环境避免 GPU 子进程缺失运行库时的窗口创建失败；
- `app.setPath('userData', ...)`：用户配置 / AI 配置 / MCP 白名单的存储根目录；
- 多窗口：`allowedModules = ['terminal', 'trend', 'rules', 'macros', 'simulator', 'serial-config', 'workbench']`，每个模块可用 `openModuleWindow(moduleId)` 独立开窗，**所有窗口经 Main IPC 复用同一个 Named Pipe 客户端**——避免每个窗口都 spawn 一份后端。

**安全配置**：

![代码片段（js） - code-09](./artifacts/blog/code-09.png)

### 3.2 Preload：暴露的"窄腰"

![代码片段（js） - code-10](./artifacts/blog/code-10.png)

渲染进程只看到这一层薄薄的对象，没有 Node 句柄，所有 IPC 都需要走 `callBackend('method', params)` 入口，由 Main 内的 `allowedRpcMethods` 白名单最终把关。

### 3.3 菜单栏与工具栏

采用 Windows 桌面应用习惯：**顶部原生菜单（文件 / 视图 / 串口 / 窗口 / 帮助）+ 主窗口顶部高频工具栏（启动 / 刷新 / 打开 / 关闭 / 发送）+ 侧栏精简**。

页面内的导航按钮被收敛到菜单和工具栏里，**主页面只留下真正需要长时间操作的元素**——这一点在 L1 阶段我们专门做了一次"主工作区去冗余化"（`changes/adopt-desktop-menu-toolbar`），验证了视觉可达性回归。

### 3.4 AI 接入与配置（DeepSeek）

DeepSeek 真实 provider 在 Main 侧分发（`backend:rpc` handler）：

![代码片段（js） - code-11](./artifacts/blog/code-11.png)

**安全边界**：未开启 `allowDataUpload` 时调用 DeepSeek 直接拒绝（`-32003` 风格错误）；不静默回退到 mock，避免让用户误以为已经走真实解析。

### 3.5 API Key 的存储策略

**默认不落盘**，这是 L3 决策里反复强调的。`AiConfig` 类（`src/main/ai-config.js`）的状态机：

![框架图 - diagram-12](./artifacts/blog/diagram-12.png)

- 配置文件 `userData/ai-config.json` 持久化字段：`provider` / `enabled` / `allowDataUpload` / `saveApiKeyToDisk`；
- `saveApiKeyToDisk=false`（默认）时，`savedApiKey` 字段根本不会出现在 JSON 里；
- `saveApiKeyToDisk=true` 时，写入明文 Key，但只在前端复选框明确勾选"将 API Key 保存到本地"时才生效；
- 用户再次取消勾选时，`savedApiKey` 立刻从文件中移除；
- `getApiKey()` 优先级：`runtimeApiKey → savedApiKey → DEEPSEEK_API_KEY → ''`；
- `useDeepSeek() = provider==='deepseek' && enabled && 有 Key`；
- `getSnapshot()` 返回 `saveApiKeyToDisk` / `hasPersistedApiKey` / `keySource`（`runtime` / `saved` / `env` / `none`）。

这条策略在第一次上线时就被反复 review：用户必须**显式同意**才能让 Key 落盘，默认行为（不落盘）和"过去认为 Key 一定安全"的传统桌面工具相反——但这正是工具需要向工程方向靠拢的体现。

### 3.6 命令生成包含本地计算的 Modbus CRC

DeepSeek 模型在命令生成时只负责给出"从站地址+功能码+数据"，**校验码由本地程序计算并追加**——这避免模型在 CRC 算式上的不稳定性，也避免出现"模型漏掉 CRC、用户设备拒绝"的事故。

`src/main/deepseek-provider.js`：

![代码片段（js） - code-13](./artifacts/blog/code-13.png)

这条逻辑和 `renderer.js` 的 `crc16Modbus`、`flow-runtime.mjs` 的实现、`ProtocolUtils.cpp::appendModbusCrc` 保持完全一致——**同一份算法在 Main / Renderer / C++ 后端各持有一份**，看似冗余，实际上避免了 IPC 往返开销，并且在工作台独立窗口里也能离线运行。

### 3.7 MCP Server：把串口能力外暴露给外部 Agent

`src/main/mcp-server.js` + `src/main/mcp-bridge.js` 实现了一个**自研的最小 MCP stdio Server**（不依赖 SDK）。

**7 个工具**：
- `list_ports`：枚举串口；
- `serial.status` / `open_connection` / `configure_connection` / `send_data` / `send_and_expect` / `read_data`：完整的串口会话能力。

**授权边界**：
- **端口白名单持久化**（`userData/mcp-ports.json`）：用户必须把端口加进白名单，否则调用被拒（`-32002`）；
- **方法白名单复用后端 `allowedRpcMethods`**：避免被外部 Agent 调用未授权方法；
- **会话隔离**：`McpBridge._ensureNotStealingSession()` 确保 MCP 的 `open_connection` / `configure_connection` 不会抢占主界面当前已经打开的串口会话；
- **send_and_expect 等待**：`McpBridge._waitForNewRx()` 在发送后等待新 RX 帧或超时，避免 expect 语义失真；
- **RX 端口隔离**：`read_data` 只返回当前 MCP 会话端口的 RX 帧，不污染全局缓冲。

MCP 子进程没有独立的 backend 凭据——所有方法都经 Main 转发到后端调用，凭证仍由主进程独占。

---

## 四、原生 JS 渲染层：六个页面与一组弹窗

下图是 SerialScope 主窗口（terminal 页面）的全貌：

![SerialScope 主界面 - terminal 页面](./artifacts/blog/01-terminal.png)

左侧栏：后端连接状态、配置保留默认测试、布局本地保存；顶部状态条显示当前串口状态、累计 RX/TX 字节和帧数；中间是收发监视面板（混合 / 文本 / HEX 三态切换 + 自动滚动 + 暂停 + 导出）；右侧是帧分析助手和规则高亮列表；底部是发送区（模式 / 行尾 / CRC / 自动补冷）。

下面我们按页面逐一展开。

### 4.1 串口调试（terminal 页面）

`page-terminal` 是产品最高频的页面，负责"开串口、看数据、发命令"。

**Dock 布局**：

![代码片段（html） - code-14](./artifacts/blog/code-14.png)

Dock 之间可以拖拽分割条调整宽度；隐藏某个 Dock 后，面板会自适应扩张；面板隐藏列表被持久化到 `localStorage['serialscope.layout']`。

**收发监视**支持三种渲染模式：
- **混合**：文本部分按 UTF-8 解码，HEX 部分按字节展开，遇到无法解码的字节用 `?` 替代（不抛错），并在 hover 时显示真实 HEX；
- **文本**：只显示解码后的字符串；
- **HEX**：只显示字节。

过滤输入：正则表达式 + 关键字过滤；命中行高亮，自动滚动到底部；暂停时新数据进入二级缓存（`rxBuffer`），恢复显示后一次性写入。

**帧分析助手**：每帧 RX 被自动分析，给出"方向 / 长度 / ASCII / HEX / 可打印比例 / JSON 解析 / Modbus CRC 校验 / 命中规则"等字段。Modbus CRC 校验失败的帧被标红。

**规则高亮**：默认规则

![框架图 - diagram-15](./artifacts/blog/diagram-15.png)

每条规则可单独启停，自带颜色 + 命中次数。命中后该行背景色变化，规则名出现在右侧"命中规则"列表里。

**发送区**：
- 模式：`Text` / `HEX`；
- 行尾：`none` / `CR` / `LF` / `CRLF`；
- `追加 Modbus CRC16`：发送时自动追加低字节在前的 CRC16-Modbus；
- `自动补冷`：自动查询，按固定间隔向设备发送（**单在途链式调度**：每一轮必须收到第一帧 RX 或超时后才发起下一轮，避免 TX/RX 时序积压）。

![代码片段（js） - code-16](./artifacts/blog/code-16.png)

自动查询在 L3 变更 `serialize-auto-query-timing` 里被改造成这种"请求—应答"调度。早期版本是 `setInterval` 无等待，结果在极限周期查询时（10ms / 30ms）出现 TX 在途堆积。新版本用 token 隔离旧轮，单在途保证。

### 4.2 趋势监视（page-trend）

![趋势监视页面](./artifacts/blog/02-trend.png)

趋势监视把"看波形"这件事从抽象的规则高亮里独立出来，给采集到的**数值**画时序曲线。

**采集曲线**：默认 5 种采集规则模板：
- **文本正则**：捕获组转为数值；
- **JSON 路径**：`$.speed` / `$.motor.rpm`；
- **CSV 列**：按索引取列；
- **HEX 偏移**：按字节偏移读无符号整数（小端 / 大端）；
- **Modbus 寄存器**：从站地址 + 功能码 03/04 + 寄存器地址 + 数据类型（U16/I16/U32/float）。

**收发速率趋势**：底层维护一个滑动窗口（最近 N 秒），按 RX/TX 分别绘制速率曲线。

**统计摘要**：实时统计接收帧、发送帧、累计接收字节、累计发送字节。

**导出**：采样曲线可导出为 CSV / JSON，便于离线分析或归档。

### 4.3 规则配置（page-rules）

把规则高亮 / 采样规则独立成可编辑列表，每条规则含：

- 名称 / 模式（正则 / JSON 路径 / CSV / HEX 偏移 / Modbus 寄存器）；
- 颜色 / 缩放 / 偏移；
- 启用开关；
- 命中次数（实时累加）。

规则保存到 `localStorage['serialscope.rules']` / `['serialscope.sampleRules']`。

### 4.4 宏命令（page-macros）

![宏命令页面](./artifacts/blog/04-macros.png)

宏是"一键发送"的最小单位。默认宏列表：

![框架图 - diagram-17](./artifacts/blog/diagram-17.png)

宏编辑器支持：
- 名称 / 模式（Text / HEX）；
- 数据（多行 / HEX 自动按空格分隔）；
- 行尾；
- CRC 计算：CRC8 / CRC16-Modbus / CRC16-CCITT-False / CRC16-XMODEM / CRC32，**点"计算并追加校验"后追加到报文末尾并自动取消"追加 Modbus CRC16"勾选**——避免重复追加；
- 删除。

宏保存到 `localStorage['serialscope.macros']`，可一键发送（直接调用 `serial:send`），发送结果实时显示在 terminal 页面。

### 4.5 模拟下位机（page-simulator）

![模拟下位机页面](./artifacts/blog/05-simulator.png)

**这是 SerialScope 区别于普通串口工具的关键能力——它自带一个"虚拟的下位机"。**

**内置规约（`builtIn`）**：

| 规约 | 行为 |
|---|---|
| `none` | 不启用任何内置 |
| `echo` | 原样回复 HEX |
| `at` | 识别 `AT+GMR`（返回 `SerialScope Simulator\r\nOK`），其他 AT 命令返回 `OK\r\n` |
| `modbus` | Modbus RTU，应答 03/04 读寄存器（随机数据）、06/10 写寄存器（回显）并自动追加 CRC16-Modbus |

**自定义收发规则**：

- `匹配 HEX` + `回复 HEX`，中间用空格分隔；
- 匹配支持 `*` 通配符（任意字节）；
- 回复模板支持占位符：
  - `{{RAND8}}`：1 字节随机数；
  - `{{RAND16LE}}` / `{{RAND16BE}}`：2 字节随机数（小端 / 大端）；
  - `{{RANDHEX:n}}`：n 字节随机 HEX。

**示例规则**：

![框架图 - diagram-18](./artifacts/blog/diagram-18.png)

**为何要内置模拟器**：

- 开发期间不必拉一台真实设备；
- 自动化测试可以挂两个 SerialScope 实例：一个跑真实串口 COM10，另一个跑模拟下位机 COM11，做端到端回归；
- 把工作台（"通信测试工作台"）的"模拟下位机回归"执行目标和独立模拟窗口打通，让回归变成可重放的脚本。

**模拟器启用控制**："启用模拟下位机"复选框默认关闭；启用后会**在第二个 SerialScope 实例打开虚拟串口的另一端后启用**——也就是"对侧"才允许应答，这样避免与主界面串口自发自收产生歧义。

### 4.6 AI 规约解析（page-protocol）

![AI 规约解析页面](./artifacts/blog/06-protocol.png)

这是 SerialScope 对"AI 上手"这件事的工程化尝试——把"读规约 → 写命令"这件工作交给 LLM，但**所有可被代码验证的步骤都让本地完成**。

**三块核心功能**：

1. **导入规约文档**：支持 `.docx`（mammoth）/ `.pdf`（pdfjs-dist legacy + DOMMatrix polyfill）/ `.txt` / `.md` / **`.xlsx` / `.xls`（SheetJS）**。Excel 解析时把每个 sheet 转为制表符分隔的表格文本（`===== Sheet: 名称 =====` 分隔），便于模型理解 Modbus 点表结构。
2. **解析规约**：调用 `ai.parseProtocol`，输出帧头（`header[]`）/ 长度域（`offset/size/includesHeader`）/ 校验类型（`checksum.type`）/ 字段表（`fields[]`，每条含 `name/offset/size/type/unit/description`）。
3. **生成命令**：调用 `ai.generateCommands`，输出命令列表 `{ name, code, checksum, description }[]`，**自动批量保存到宏库**（避免逐条手动点击）。
4. **人工校正**：把模型结果渲染成可编辑字段表（名称 / 偏移 / 字节数可改），用户可人工校正后保存到本地配置（`localStorage['serialscope.protocol']`），可导出为 `protocol-<帧头hex>.json`。

**解析失败的容错**（这是最近一段时间踩过的最大一个坑）：

![框架图 - diagram-19](./artifacts/blog/diagram-19.png)

同时为了排查类似问题，`callChatCompletions` 改为累积 Buffer 最后一次性 UTF-8 解码（避免分块切断多字节字符产生 U+FFFD），并把 DeepSeek 原始回复用 `console.debug` 打印——`extractJson` 解析失败时把原始文本纳入错误信息。

### 4.7 AI 配置弹窗

![AI 配置弹窗](./artifacts/blog/07-ai-config.png)

使用说明里明确写了三件事：

1. **数据上传**：启用后，规约文本与（若开启）最近串口接收数据将发送到 DeepSeek 云端——必须显式同意；
2. **API Key 存储**：默认不落盘，仅本次会话有效；勾选"保存到本地"才会写入 `userData/ai-config.json`，下次启动自动读取；
3. **测试连接**：用极小请求（`ping`，`maxTokens:5`）验证 Key 有效性，无需先保存。

保存按钮调用 `configureAi({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey, saveApiKeyToDisk })`，统一固定 provider / enabled / 上传标志，用户只填 Key。

---

## 五、通信测试工作台（React Flow）

![通信测试工作台](./artifacts/blog/09-react-workbench.png)

工作台是 SerialScope 的"工程化主战场"。它不是一个"开串口+看数据"的工具，而是一个**可以像代码一样被版本化、被自动执行的串口测试编排器**。

### 5.1 为什么是 React Flow

节点编排工具的可选项很多（React Flow / rete.js / LiteGraph / JointJS）。我们选 React Flow 的理由：

- **声明式**（节点 + 边 + handle）容易和 React 生态融合；
- **MIT 许可**，无 Pro 版强约束；
- **节点自定义**通过普通 React 组件，可以直接把宏库编辑器、条件编辑器、报告展示器嵌入节点；
- MiniMap / Background / Controls 内置，省去造轮子。

### 5.2 节点种类

![框架图 - diagram-20](./artifacts/blog/diagram-20.png)

### 5.3 条件编辑器

条件是工作台里最复杂的部分。支持：

- **HEX 整帧**：startsWith / contains / equals；
- **文本**：包含 / 正则；
- **文本正则**：自定义正则；
- **规则命中**：引用规则库里的某条规则；
- **变量**：比对上下文中的 `{{变量}}`；
- **Modbus 寄存器**：从站地址 + 功能码 03/04 + 起始地址 + 目标寄存器地址 + 数据类型（U16 / I16 / U32 / I32 / float32）；
- **字节字段（通用二进制）**：任意协议的零基字节偏移 + 数据类型。

Modbus 寄存器条件强制要求 CRC16 校验正确（越界、截断、CRC 错误、未知类型都返回 false，不能放行写入分支）——这条**安全语义**是从工作台对真实 Modbus Slave 做联调时累积出来的，**病态但语法正确的正则性能限制**是已知 P2（条件求值有 500 步上限，但不会拒绝不安全的输入）。

### 5.4 执行目标：模拟回归 vs 真实设备

![框架图 - diagram-21](./artifacts/blog/diagram-21.png)

模拟回归不要求人工授权；真实设备必须：

1. 显式勾选"我已了解风险"；
2. `beginWorkbenchExecution` 二次确认（10 分钟时效）；
3. 工作台执行完成后调用 `endWorkbenchExecution` 释放授权。

这条边界确保：**没有用户授权，工作台永远不会向真实物理串口写入**。

### 5.5 启动第二个模拟实例

工作台的"启动第二个模拟实例"按钮，会通过 `workbench:launchSimulator` IPC 启动一个**独立的 Electron 子实例**：

- 临时 userData Profile（隔离配置）；
- 强制占用 ELTIMA 虚拟串口 COM10（9600 baud，`virtual-simulator-port.js` 校验描述含 ELTIMA/VIRTUAL/SERIAL）；
- 配置限制：`builtIn` 白名单、`delayMs` 0-10000、rules ≤100、配置 ≤24KB；
- 30 秒未就绪会终止子实例并允许重试；
- 通过 IPC 回传 `simulator-progress` / `simulator-ready` 状态。

这是 L3 变更 `add-device-test-workbench` 里反复 review 的成果——双 Electron 端到端、子实例 Profile 清理、24ms/64KiB 聚合边界、报告快照验证等 P1/P2 都已解决。

### 5.6 报告与版本管理

执行流程后可以：

- **导出报告**：JSON / CSV / HTML 三种格式，含 version / startedAt / durationMs / result / variables / frames / steps / 消费帧；
- **重放报告**：把报告里的宏快照重新注入主流程做重放；
- **保存用例版本**：最多保存 20 个版本（`saveFlowVersion`），可载入对比；
- **节点运行时高亮**：执行过程中当前节点高亮，失败原因直接展示在节点上。

---

## 六、安全与权限：默认边界而不是"用户主动关闭危险"

SerialScope 的安全模型不是"默认宽松、让用户关闭危险选项"，而是**默认严格、需要显式开启才能突破**。具体到几处关键边界：

### 6.1 API Key 默认不落盘

前面已经说过（3.5 节）。简而言之：用户在 AI 配置窗口里填的 Key 默认只活在内存里，关掉应用就消失；只有显式勾选"保存到本地"才写明文。

### 6.2 数据上传必须显式授权

`allowDataUpload=false` 时调用真实 DeepSeek 直接拒绝（`-32003` 风格错误），不静默回退 mock。理由：**静默回退会让用户误以为真实解析已经发生，但拿到的其实是 mock 数据**——这种 bug 在自动化场景里极难发现。

### 6.3 模拟回归隔离

模拟器只能连接 COM10 / COM11 虚拟串口。`virtual-simulator-port.js` 通过 `Get-CimInstance Win32_SerialPort` + 端口描述匹配（ELTIMA / VIRTUAL / SERIAL）来校验；非虚拟端口被拒绝。

### 6.4 工作台执行授权

工作台执行流程分两步授权：

1. UI 上勾选"我已了解风险"；
2. `beginWorkbenchExecution(request)` 触发二次确认（10 分钟时效）；

不授权就不写真实设备。

### 6.5 MCP 会话隔离

MCP 的 `open_connection` / `configure_connection` 不会抢占主界面已经打开的串口会话——`McpBridge._ensureNotStealingSession()` 强制检查：当前会话已打开**不同**端口时 MCP 请求被拒（`-32003`）；同端口或空闲时才放行。

这条边界是从 G3 审核里发现的 P1 修过来的——原始实现里 MCP 调用 `serial.open` 会替换主界面已经打开的串口会话，可能干扰用户的工作。

---

## 七、AI 协作流程：以风险为中心的开发节奏

SerialScope 不仅是一个工具，它还是**用它自己的 AI 协作框架开发的工具**。仓库根目录有 `AGENTS.md`：

- **风险分档 L0/L1/L2/L3**：先分档，再选流程；
- **L2/L3 必须有变更包**：从 `changes/_template/` 复制，包含 `proposal.md` / `design.md` / `specification.md` / `tasks.md` / `evidence.md` / `change.json`；
- **证据验证状态**：仅 `passed` / `failed` / `blocked` / `not-run`，不得互换或省略失败边界；
- **`review-passed` 不等于 `archived`**：归档、发布、真实外部写入和破坏性 Git 操作都需要人工确认；
- **`process:check` 校验**：检查活动变更包与机器可读证据。

比如这次写文档前我们刚跑过：

![框架图 - diagram-22](./artifacts/blog/diagram-22.png)

24 个变更包覆盖了：

![框架图 - diagram-23](./artifacts/blog/diagram-23.png)

每个包都有独立 evidence.md 记录命令 / kind / status / purpose / doesNotProve / reason（blocked/not-run 必须带原因）。

这种开发节奏的好处是**所有"看似能用"但其实没验证的功能都被显式标记**，而不是悄悄出现在 README 里。

---

## 八、构建与运行

### 8.1 依赖

- **Windows**（当前项目目标平台）；
- **Visual Studio 2022 C++ 工具链**；
- **CMake** + **vcpkg**（boost-system、nlohmann-json）；
- **Node.js / npm**；
- **Electron 39**（`node_modules/electron` 已锁版）。

### 8.2 构建

![代码片段（powershell） - code-24](./artifacts/blog/code-24.png)

构建产物：`backend/bin/serialscope-backend.exe`、`src/renderer-dist/index.html`（React 工作台）。

### 8.3 验证

![代码片段（powershell） - code-25](./artifacts/blog/code-25.png)

这些自动化**不替代真实物理设备验证**——AGENTS.md 里明确写了"真实硬件验证必须按 L3 流程记录设备、参数和授权"。

---

## 九、当前发布与外部验证边界

协议生命周期、持久化诊断、可选自动重连，以及 921600 bps 短帧和 128 KiB 固定帧的虚拟串口回归均已纳入验证。当前剩余事项都需要发布条件、外部环境或人工授权：

### 9.1 Windows 安装包、代码签名、自动更新

项目目前是"开发态运行"，没有 NSIS / MSI 打包、Authenticode 签名、auto-update 通道。

### 9.2 跨用户 / 跨 Windows 会话拒绝

Named Pipe 的 SID DACL 已通过单元测试，但**没有在不同 Windows 会话里实跑过**——AGENTS.md 的 G3 边界要求"必须真实跑通"才算完成。

### 9.3 CSerialPort 的 LGPL 许可证审查

CSerialPort 是 **LGPL-3.0-only WITH LGPL-3.0-linking-exception**。动态链接 + 不修改 + 包含许可证声明 + 可重链接，这在工程上已经合规；但**真实产品交付前需要走一轮正式的法务/合规审查**。

### 9.4 真实物理设备回归

所有自动化都是 ELTIMA 虚拟串口对（COM10/COM11），**真实 Modbus Slave / 真实 PLC 仍未在自动化里跑通**。AGENTS.md 把它定义为 L3 边界——必须用户授权 + 明确设备/参数/操作 + 二次确认。

---

## 十、回到最初那个问题：能不能把串口调试做成工程工具？

回顾过去这段时间的迭代，我自己的结论是：**能，但要付出"工程化"的代价**。

"工程化"的代价主要体现在三件事上：

1. **架构分层**——Electron + C++ + Named Pipe JSON-RPC 看起来"过度设计"，但它换来的是：后端可以独立跑独立测，UI 不会卡串口读写，安全边界可以分层叠加；
2. **每个字节都要校验**——CRC、长度域、分隔符、超限恢复，这些"用户其实不太关心"的细节在 SerialScope 里全都做了本地计算；模型只负责生成主体；
3. **每个权限边界都要显式声明**——API Key 默认不落盘、数据上传要显式授权、工作台执行要二次确认、MCP 不抢主会话——这些都是**默认值就是安全的**而不是"用户主动关闭危险"。

代价是开发节奏变慢了。L2/L3 变更包、场景—验证映射、独立只读审核，这些流程让一次"加一个校验方式"的工作也要花上 1-2 天。但好处是：

- 任何"看起来能跑但没验证"的改动都被显式标记（`not-run` / `blocked` 必须带 reason）；
- 任何"改变默认安全边界"的改动都被强制推到 L3 走人工闸门；
- 任何"破坏既有契约"的改动都会被 `process:check` 和回归测试挡住。

这是我自己从一个"调试工具用户"慢慢变成一个"调试工具作者"时学到的最重要的事：

> **工具的可靠性不是靠"开发时候多写点测试"就能买到的，而是靠"每一次改动都问一遍：这条边界有没有被显式覆盖"慢慢攒出来的。**

如果你也对"做一个可以像代码一样被审视、被版本化、被自动化的串口工具"感兴趣，欢迎一起聊。SerialScope 这个项目还在持续迭代，下次可能写一写"通信测试工作台里条件求值器的设计取舍"，或者"为什么我把 MCP Server 做成自研最小实现而不是用 SDK"。
