# SerialScope NativeElectron

这是一个非 Qt 后端版本的 SerialScope 串口调试上位机。前端使用 Electron + 纯前端 UI，后端为独立 C++ 进程，通过当前 Windows 用户专属的 Named Pipe + JSON-RPC 2.0 通信。

## 架构

```text
Electron 主进程
  - 启动 / 退出 C++ 后端进程
  - 通过 Preload 向渲染进程暴露受限 IPC
  - 持有 Named Pipe JSON-RPC 客户端

Electron 渲染进程
  - 串口配置
  - 收发监视
  - 曲线解析规则
  - 帧模板
  - 宏编辑、保存、执行
  - 模拟下位机（内置规约与自定义回复）
  - 规则说明与导入导出

C++ 独立后端
  - CSerialPort：跨平台串口枚举、打开、关闭、读写
  - Boost.Asio：后端主事件循环
  - Win32 Named Pipe：当前用户、单客户端、本地 JSON-RPC 传输
  - nlohmann/json：JSON-RPC 编解码
```

前后端通信使用 4 字节小端长度前缀的 JSON-RPC 2.0 消息。Electron Renderer 不直接持有网络 socket；核心方法包括：

- `ports.list`：枚举串口
- `serial.open`：打开串口
- `serial.close`：关闭串口
- `serial.send`：发送文本或十六进制数据
- `backend.shutdown`：关闭后端服务

## 依赖

本项目不依赖 Qt。需要本机已安装：

- Visual Studio 2022 C++ 工具链
- CMake
- PowerShell 7
- Node.js / npm
- Electron 依赖，可复用上级目录已有 `node_modules`
- vcpkg 包：`boost-system`、`nlohmann-json`
- 仓库内锁定的 CSerialPort v5 源码：`backend/vendor/CSerialPort/`

当前脚本默认读取：

```text
D:\WORKSPACE\Electron\tools\vcpkg\scripts\buildsystems\vcpkg.cmake
```

## 构建

```powershell
cd D:\WORKSPACE\Electron\SerialScope-BoostElectron
npm run build:backend
```

构建产物会复制到：

```text
backend\bin\serialscope-backend.exe
```

## 运行

```powershell
cd D:\WORKSPACE\Electron\SerialScope-BoostElectron
npm run dev
```

Electron 主进程会自动启动 C++ 后端，并创建形如以下名称的当前用户本地管道：

```text
\\.\pipe\SerialScope.Native.<随机 UUID>
```

## 功能与使用边界

- “独立窗口”可将串口调试、趋势、规则、宏命令和模拟下位机分别打开；所有窗口都经 Main IPC 复用同一个 Named Pipe 客户端。
- 宏命令支持新建、编辑、删除、本地保存和随配置文件导入/导出恢复；执行仍使用普通 `serial.send`，因此必须由用户先打开串口。
- 模拟下位机默认关闭。让一个实例打开 COM11、另一个实例打开 COM10 后，可启用 Echo、AT、Modbus RTU（03/04/06/16）或自定义完整 HEX 匹配规则。回复模板可用 `{{RAND8}}`、`{{RAND16LE}}`、`{{RAND16BE}}`、`{{RANDHEX:n}}` 生成随机字节。
- 打开独立模拟窗口时，它是唯一的自动回复执行者，避免接收通知被多窗口广播后重复写串口。

## 验证（ELTIMA COM10/COM11）

下列自动化均使用仓库构建的原生 Win32 辅助程序访问虚拟串口，不再使用容易被 Defender 拦截的 PowerShell `System.IO.Ports` 路径：

```powershell
npm run test:named-pipe-serial
npm run test:named-pipe-fixed-frame
npm run test:named-pipe-outbound-boundary
npm run test:named-pipe-single-client
npm run test:electron-ui
```

它们覆盖 CSerialPort v5 的 COM10/COM11 双向收发、128 KiB 定长帧、恰好 4 MiB 出站边界、慢客户端恢复、第二客户端占用，以及可见 Electron 窗口的宏和模拟下位机交互。它们不替代跨用户/跨 Windows 会话拒绝或真实物理设备验证。

## AI 开发流程

仓库使用以风险为中心的 AI 协作流程；完整约束见 [AGENTS.md](AGENTS.md)。

- L0/L1 使用短路径：说明意图、做定向验证并如实记录。
- L2/L3 在 `changes/<change-id>/` 创建变更包；从 `changes/_template/` 复制，并先完成场景—验证映射。
- 运行以下命令检查活动变更包与 `evidence.md` 中的机器可读证据：

```powershell
npm run process:check
```

真实串口设备写入、默认安全边界调整、发布与归档均为 L3 人工闸门；本地启动和语法检查不能替代硬件验证。仓库结构与验证范围见 [process/repo-map.md](process/repo-map.md)。

## 与 Qt 后端版本的差异

优势：

- 后端不引入 Qt Runtime，安装包体积和依赖面通常更小。
- CSerialPort 负责串口平台差异，Boost.Asio 负责服务事件循环，Named Pipe + JSON-RPC 让 IPC 不暴露 TCP 监听端口。
- C++ 后端更接近服务化架构，后续替换为 gRPC / Protobuf 或拆分后台服务更自然。

代价：

- 串口、线程、定时器、日志、配置、国际化等能力需要分别选型，而 Qt 版本自带较完整的基础设施。
- CSerialPort 是 LGPL-3.0-only WITH LGPL-3.0-linking-exception，真实产品交付前需要纳入许可证审查。
- CSerialPort 读取事件来自库内部线程，本应用会转投递到 Boost.Asio 主事件循环后再通知 Electron Main。

## 当前边界

当前已实现串口枚举、打开、关闭、收发、统计、规则解析和 UI 交互；ELTIMA 虚拟串口对已验证。后端已对 Windows 本地编码和串口二进制数据做 UTF-8 防护，避免 JSON 序列化因非法字节退出。真实设备验证必须按 L3 流程记录设备、参数和授权。真实产品交付前建议继续补充：

- 后端单元测试和协议测试
- 持久化日志与崩溃诊断
- 自动重连策略
- 串口独占与错误恢复策略
- Windows 安装包、代码签名、自动更新
- 大流量串口数据下的前端限流和后端环形缓冲

生产发布、跨 Windows 会话拒绝、CSerialPort LGPL 审查和真实物理设备回归的人工闸门见 [发布与外部验证清单](docs/release-and-external-validation-gates.md)。
