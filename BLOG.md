# SerialScope Native：从零搭建一个 Electron + Boost.Beast 串口调试工具

> Electron 做壳，C++ 做服务，Boost.Asio 跑事件循环，CSerialPort 操控串口，WebSocket 在中间牵线——这是一个从零开始构建的轻量级串口调试上位机的实践记录。

![SerialScope 主界面](./screenshots/main.png)

## 一、为什么自己写一个串口工具

市面上的串口调试工具不少，但大多数是「单进程一体式」的设计：UI 和串口逻辑挤在同一个进程里，要么是纯原生 GUI，要么是 Electron 直接调 Node addon。 SerialScope Native 想换一种思路：

1. **后端服务化**——把串口能力抽成独立 C++ 进程，UI 和硬件彻底解耦；
2. **依赖尽量轻**——不引入大型 GUI 框架运行时，靠 Boost + CSerialPort 这种轻量组合；
3. **协议可替换**——前后端用 WebSocket JSON 通信，后续可以平滑迁移到 gRPC / Protobuf。

最终得到的，是一个 C++20 编译、基于 vcpkg 管理依赖、通过 WebSocket JSON 协议与 Electron 前端通信的串口调试上位机。

## 二、整体架构

```text
┌──────────────────────────────────────────────┐
│  Electron 主进程 (main.js)                    │
│  - spawn / kill C++ 后端进程                  │
│  - 通过 preload.js 暴露安全 IPC               │
└───────────────┬──────────────────────────────┘
                │ spawn
                v
┌──────────────────────────────────────────────┐
│  C++ 独立后端 (serialscope-backend.exe)        │
│  - CSerialPort    串口枚举/打开/读写           │
│  - Boost.Asio     事件循环                    │
│  - Boost.Beast    WebSocket 服务              │
│  - nlohmann/json  协议编解码                  │
└───────────────┬──────────────────────────────┘
                │ ws://127.0.0.1:47990
                v
┌──────────────────────────────────────────────┐
│  Electron 渲染进程 (renderer.js)              │
│  - 串口配置 / 收发监视 / 帧分析                │
│  - 曲线解析规则 / 宏命令 / 规则配置            │
└──────────────────────────────────────────────┘
```

前后端之间不共享内存，只通过本地回环的 WebSocket 交换 JSON 消息。这种设计让后端可以独立编译、独立运行，未来也方便独立部署或替换。

## 三、C++ 后端：分工明确的三层

后端代码非常克制，只有四个源文件：

| 文件 | 职责 |
|------|------|
| `main.cpp` | 解析 `--port` 参数，启动 `io_context` |
| `WebSocketServer.cpp/.h` | Boost.Beast WebSocket 服务、命令路由 |
| `SerialSession.cpp/.h` | CSerialPort 封装、串口状态机、收发统计 |
| `ProtocolUtils.cpp/.h` | HEX / 文本 / CRC / UTF-8 防护等工具函数 |

### 3.1 事件循环：一个 `io_context` 跑全部

后端的入口极其简洁：

```cpp
boost::asio::io_context io;
auto server = std::make_shared<WebSocketServer>(io, port);
if (!server->listen()) { /* ... */ }
io.run();
```

WebSocket 接收、广播、定时器、串口事件回投，全部走同一个 `io_context`。这样避免了多线程同步的复杂度，串口的读事件也通过 `asio::post` 转回主线程处理。

### 3.2 串口：CSerialPort + 线程转投

CSerialPort 的读取通知来自库内部线程，本项目的做法是：

```cpp
void SerialSession::onReadEvent(const char*, unsigned int readBufferLen) {
  // 在 CSerialPort 内部线程读出数据
  // ...
  asio::post(io_, [self, bytes = std::move(bytes)]() mutable {
    self->handleReceived(std::move(bytes));
  });
}
```

把数据 `post` 回 Asio 主循环后再更新统计、广播事件。这样所有共享状态只在主线程访问，`portMutex_` 只用来保护 `CSerialPort` 实例本身的读写。

![串口收发过程](./screenshots/serial-flow.png)

### 3.3 WebSocket 协议：五个核心命令

协议设计极简且可读：

| 命令 | 方向 | 作用 |
|------|------|------|
| `ports:list` | 前端 → 后端 | 枚举本机串口 |
| `serial:open` | 前端 → 后端 | 打开串口（含波特率/校验/流控等） |
| `serial:close` | 前端 → 后端 | 关闭串口 |
| `serial:send` | 前端 → 后端 | 发送文本或 HEX，可选追加 Modbus CRC16 |
| `backend:shutdown` | 前端 → 后端 | 优雅关闭后端 |

后端主动推送的消息包括 `backend:hello`、`serial:state`、`serial:rx`、`serial:tx`，前端据此更新状态条和日志。

### 3.4 二进制安全：UTF-8 防护

串口数据是原始字节，而 JSON 必须是合法 UTF-8。后端在 `ProtocolUtils.cpp` 里做了两层防护：

- `bytesToDisplayText`：把不可打印字符转义成 `\xNN`，保证日志可读；
- `sanitizeUtf8` / `nativeToUtf8`：把 Windows 本地编码和非法字节统一处理成合法 UTF-8，避免 `json::dump` 因非法字节抛异常。

这是一个容易被忽略、但实战中会要命的细节。

## 四、Electron 前端：安全与解耦

### 4.1 主进程：只做进程管理

`src/main/main.js` 职责单一：

- `spawn` 启动 C++ 后端，转发 stdout/stderr 到渲染进程的日志面板；
- `before-quit` 时 kill 后端；
- 通过 IPC 暴露 `backend:info`、`backend:start`、`file:saveText`、`file:openJson` 四个能力。

### 4.2 Preload：最小化暴露面

```js
contextBridge.exposeInMainWorld('serialScope', {
  getBackendInfo: () => ipcRenderer.invoke('backend:info'),
  startBackend:   () => ipcRenderer.invoke('backend:start'),
  saveTextFile:   (options) => ipcRenderer.invoke('file:saveText', options),
  openJsonFile:   (options) => ipcRenderer.invoke('file:openJson', options),
  onBackendLog:   (callback) => { /* ... */ },
  onBackendExit:  (callback) => { /* ... */ }
});
```

渲染进程 `contextIsolation: true`、`nodeIntegration: false`，所有原生能力都经过 preload 收口。

### 4.3 渲染进程：四个功能页

前端 UI 全部用原生 HTML + CSS + JS，没有引入框架。四个页面：

- **串口调试**：连接参数、收发监视（混合/文本/HEX 三态）、帧分析助手、规则高亮、发送区（支持 Modbus CRC16、自动发送）
- **趋势监视**：采集曲线（支持正则/JSON/CSV/HEX/Modbus 五种解析模板）、收发速率趋势、统计摘要
- **规则配置**：高亮规则编辑器、使用说明
- **宏命令**：常用帧模板一键发送

![趋势监视页](./screenshots/trend.png)

## 五、构建与运行

### 5.1 依赖

- Visual Studio 2022 C++ 工具链
- CMake + Ninja
- PowerShell 7
- Node.js / npm
- vcpkg 包：`cserialport`、`boost-beast`、`boost-system`、`nlohmann-json`

### 5.2 一键构建

```powershell
npm run build:backend
```

构建脚本 `scripts/build-backend.ps1` 会自动：

1. 调用 `VsDevCmd.bat` 配置 MSVC 环境；
2. 用 vcpkg toolchain 配置 CMake；
3. 编译并复制 `serialscope-backend.exe` 及依赖 DLL 到 `backend/bin/`。

### 5.3 启动

```powershell
npm run dev
```

Electron 主进程会自动拉起 C++ 后端，渲染进程连接 `ws://127.0.0.1:47990`。

![后端启动日志](./screenshots/backend-log.png)

## 六、技术选型小结

| 关注点 | 选型 | 理由 |
|--------|------|------|
| 事件循环 | Boost.Asio | 单线程模型，避免多线程同步复杂度 |
| WebSocket | Boost.Beast | 与 Asio 同源，异步模型一致 |
| 串口 | CSerialPort | 轻量、跨平台、接口清晰 |
| JSON | nlohmann/json | 头文件库，集成成本几乎为零 |
| 包管理 | vcpkg | 与 CMake 集成自然，Windows 体验好 |
| 前端 | Electron + 原生 JS | 不引入框架，体积可控 |
| 前后端通信 | 本地回环 WebSocket | 进程隔离，协议可替换 |

整体思路：**用轻量、可替换、服务化的组合，搭一个能真正干活的串口调试工具**。

## 七、踩过的坑

### 7.1 CSerialPort 的读取线程

CSerialPort 的读事件在库内部线程触发，直接在回调里操作共享状态会踩竞态。解法是 `asio::post` 回主循环，让所有状态变更串行化。

### 7.2 COM 口名超 4 字符

Windows 上 `COM10` 之后的端口需要用 `\\.\COM10` 形式打开。后端在 `portSystemLocation` 里做了自动补全。

### 7.3 串口字节的 UTF-8 防护

串口数据可能包含任意字节，直接塞进 JSON 会让 `nlohmann::json::dump` 抛异常。后端用 `error_handler_t::replace` 兜底，并在显示层做 `\xNN` 转义。

## 八、当前边界与后续

作为一个**从零搭建的架构型 Demo**，目前已实现真实串口枚举、打开、关闭、收发、统计、规则解析和 UI 交互。距离生产级还差：

- 后端单元测试与协议测试
- 持久化日志与崩溃诊断
- 自动重连策略
- 串口独占与错误恢复
- Windows 安装包、代码签名、自动更新
- 大流量下的前端限流与后端环形缓冲

但它已经足够说明：**Boost.Asio + Beast + CSerialPort + nlohmann/json 这套组合，完全能撑起一个轻量级、服务化的串口后端**。

---

*项目地址：SerialScope-BoostElectron | 许可证：MIT（CSerialPort 为 LGPL-3.0 + linking exception，交付前需审查）*
