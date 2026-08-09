# Specification: migrate-renderer-to-react

## Requirement: React renderer shell

应用 MUST 通过 React 挂载 Renderer，且 MUST 使用既有 Preload 暴露的受限 `window.serialScope` API。

### Scenario: secure startup

- GIVEN 生产 Electron 启动
- WHEN React 根组件完成挂载
- THEN 后端连接状态可见，且 Renderer 不获得 Node.js 直接访问权限。

## Requirement: functional parity during migration

迁移完成的模块 MUST 保持其迁移前可观察行为；未迁移模块不得被静默移除。

### Scenario: serial terminal

- GIVEN React 终端页面与 COM10/COM11 虚拟对
- WHEN 用户打开串口、发送 HEX 并收到 RX
- THEN 日志、统计与串口状态正确更新。

## Non-requirements

不承诺在本 change 内完成节点测试工作台。
