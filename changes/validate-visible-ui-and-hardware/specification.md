# Specification: validate-visible-ui-and-hardware

## Requirement: 可见桌面交互

Electron MUST 创建可见窗口；在后端就绪后，窗口 MUST 显示可用串口并允许用户刷新、打开、发送、接收和关闭。Renderer MUST NOT 直接连接 TCP/WebSocket。

### Scenario: 虚拟串口 UI 收发

- GIVEN ELTIMA COM10/COM11 虚拟对可用
- WHEN 用户在可见窗口打开 COM10、发送 `CA FE`，并从 COM11 写入 `41 42`
- THEN 窗口显示后端已连接、发送记录和接收记录，且关闭操作恢复“串口未打开”状态。

## Requirement: 真实设备安全验证

真实设备验证 MUST 记录设备身份、端口、完整串口参数、操作授权、探测报文与观察范围。若任一项缺失，MUST NOT 向端口发送数据。

### Scenario: 获授权的非控制性探测

- GIVEN 用户提供真实设备、串口参数和非控制性探测报文的发送授权
- WHEN 应用打开该端口并发送该报文
- THEN 记录应用可见的发送与接收结果，且不夸大为控制或功能性验证。

## Non-requirements

本 change 不证明真实设备可承受任意报文，不替代设备协议或现场安全规程。
