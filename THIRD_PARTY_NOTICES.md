# Third-party notices

本文件须随每个 Windows 安装包、便携版和更新制品分发。它列出 SerialScope 当前直接使用的主要第三方组件；正式发布前，发布负责人须以锁定依赖和实际制品重新生成并由法务审核。

## CSerialPort

- 位置：`backend/vendor/CSerialPort`
- 许可证：LGPL-3.0-only WITH LGPL-3.0-linking-exception
- 完整许可证文本：`backend/vendor/CSerialPort/LICENSE`

SerialScope 目前将该库作为独立 C++ 库构建。是否满足最终交付场景下的链接、修改、可重链接及源代码提供义务，必须由法务书面确认；本通知不构成法律意见。

## Boost

- 用途：Boost.Asio、Boost.System
- 许可证：Boost Software License 1.0

## nlohmann/json

- 用途：Native JSON-RPC 与协议 JSON
- 许可证：MIT

## Electron 与 npm 依赖

Electron、React、Vite、@xyflow/react、Mammoth、pdfjs-dist、xlsx 及未来打包/更新依赖的准确版本和许可证，必须从生产 `package-lock.json` 和实际构建制品生成清单。未锁定的依赖或未审核的新增依赖不得进入发布通道。
