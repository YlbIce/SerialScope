# SerialScope NativeElectron

这是一个非 Qt 后端版本的 SerialScope 串口调试上位机 Demo。前端沿用 Electron + 纯前端 UI，后端改为独立 C++ 服务，使用成熟开源库完成串口、事件循环、WebSocket 和 JSON 处理。

## 架构

```text
Electron 主进程
  - 启动 / 退出 C++ 后端进程
  - 向渲染进程暴露安全 IPC

Electron 渲染进程
  - 串口配置
  - 收发监视
  - 曲线解析规则
  - 帧模板
  - 规则说明与导入导出

C++ 独立后端
  - CSerialPort：跨平台串口枚举、打开、关闭、读写
  - Boost.Asio：后端主事件循环
  - Boost.Beast：WebSocket 服务
  - nlohmann/json：协议 JSON 编解码
```

前后端通信协议沿用当前 SerialScope 的 WebSocket JSON 协议，核心命令包括：

- `ports:list`：枚举串口
- `serial:open`：打开串口
- `serial:close`：关闭串口
- `serial:send`：发送文本或十六进制数据
- `backend:shutdown`：关闭后端服务

## 依赖

本项目不依赖 Qt。需要本机已安装：

- Visual Studio 2022 C++ 工具链
- CMake
- PowerShell 7
- Node.js / npm
- Electron 依赖，可复用上级目录已有 `node_modules`
- vcpkg 包：
  - `cserialport`
  - `boost-beast`
  - `boost-system`
  - `nlohmann-json`

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

Electron 主进程会自动启动 C++ 后端，并连接：

```text
ws://127.0.0.1:47990
```

## 与 Qt 后端版本的差异

优势：

- 后端不引入 Qt Runtime，安装包体积和依赖面通常更小。
- CSerialPort 负责串口平台差异，Boost.Asio / Beast 负责服务事件循环和 WebSocket，职责边界更清晰。
- C++ 后端更接近服务化架构，后续替换为 gRPC / Protobuf 或拆分后台服务更自然。

代价：

- 串口、线程、定时器、日志、配置、国际化等能力需要分别选型，而 Qt 版本自带较完整的基础设施。
- CSerialPort 是 LGPL-3.0-only WITH LGPL-3.0-linking-exception，真实产品交付前需要纳入许可证审查。
- CSerialPort 读取事件来自库内部线程，本 Demo 会转投递到 Boost.Asio 主事件循环后再广播到 WebSocket。

## 当前边界

这是一个架构型 Demo，已经实现真实串口枚举、打开、关闭、收发、统计、规则解析和 UI 交互。后端已对 Windows 本地编码和串口二进制数据做 UTF-8 防护，避免 JSON 序列化因非法字节退出。真实产品交付前建议继续补充：

- 后端单元测试和协议测试
- 持久化日志与崩溃诊断
- 自动重连策略
- 串口独占与错误恢复策略
- Windows 安装包、代码签名、自动更新
- 大流量串口数据下的前端限流和后端环形缓冲
