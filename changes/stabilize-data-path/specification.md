# Specification: stabilize-data-path

## Requirement: 有界 WebSocket 传输

后端 MUST 将每个 WebSocket 会话的最大入站消息设为 1 MiB。控制消息（命令结果、error、state、hello）MUST 使用独立且优先的 64 条/1 MiB 队列；实时 RX/TX 事件 MUST 限制为 256 条/4 MiB。超过实时上限的事件 MAY 被丢弃；一旦检测到丢弃且控制队列有容量，后端 MUST 尽快通过优先控制队列向该客户端发送丢失计数通知。

### Scenario: 慢速客户端

- GIVEN 一个客户端无法及时读取串口事件
- WHEN 该客户端待写队列达到任一上限
- THEN 新事件不再让该客户端队列无限增长
- AND 服务继续处理串口与其他客户端
- AND 客户端在可发送下一条消息时优先获得 `backend:backpressure` 通知

### Scenario: 实时队列满载时的命令响应

- GIVEN 客户端的实时 RX/TX 队列已满
- WHEN 同一客户端发送一个有效命令
- THEN 命令结果或 error 进入优先控制队列
- AND 不得作为实时事件被丢弃

## Requirement: 容错命令与连接管理

后端 MUST 对非 JSON、非对象 command、非字符串 type、非对象 payload 和错误字段类型返回 `error`。Renderer MUST 忽略不属于当前 socket 的 close/error 回调，并且同一时间只保留一个重连定时器。

### Scenario: 畸形命令

- GIVEN WebSocket 收到 `payload` 为字符串或串口字段类型错误的命令
- WHEN 后端路由该命令
- THEN 客户端收到含 requestId 的 `error`
- AND 后端进程继续运行

### Scenario: 旧 socket 关闭

- GIVEN 手动连接已替换旧 WebSocket
- WHEN 旧 WebSocket 触发 close
- THEN 当前连接状态和当前重连计划不被旧回调覆盖

## Requirement: 批量 UI 更新

Renderer MUST 将同一动画帧内的多条日志合并为最多一次 `renderLog`，并能显示数值 0。损坏的本地 profile MUST 不阻断启动。

## Non-requirements

不定义串口帧边界，不保证过载时每条可视化日志都被保留，不证明真实设备兼容性。
