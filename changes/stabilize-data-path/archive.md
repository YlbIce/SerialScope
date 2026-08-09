# Archive: stabilize-data-path

## Review decision

- Mode S review rounds: `4`
- Result: `approved`
- P1: `0`
- P2: `0`

审核过程曾发现控制消息与实时消息未分级、启动按钮旁路重连调度、状态事件分类错误与背压通知时序不一致；均已修复并经最终独立审核通过。

## Human archive gate

- Approved by: user
- Approval text: `确认`
- Archive status: `archived`

## Known limits retained

- 慢客户端背压集成压测为 `blocked`，原因与清理记录见 evidence。
- Electron 重连 smoke、慢客户端阈值及真实物理串口兼容性未验证。
- 本归档不自动启动后续帧解码 change。
