# Design: stabilize-data-path

## Decisions

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 慢客户端处理 | 控制消息与实时事件分队列：控制队列保留 64 条/1 MiB 并优先发送，实时队列限制 256 条/4 MiB；只丢弃实时事件并发 backpressure 通知 | 命令结果与 error 不能因日志洪峰丢失，同时串口读取和其他客户端不被慢 UI 拖垮 |
| 入站限制 | Beast `read_message_max` 设为 1 MiB | 本地协议命令应很小，拒绝异常输入占用内存 |
| 协议校验 | 路由层校验 command/type/payload，串口层捕获字段类型异常 | 错误输入得到结构化 error，不跨边界抛异常 |
| 重连所有权 | 仅 `state.ws` 对应的 socket 可更新状态；仅一个退避定时器 | 消除旧 close 回调和手动连接竞争 |
| Renderer 吞吐 | 日志使用 requestAnimationFrame 合帧；图表可见时 10 FPS、隐藏时低频检查 | 控制 DOM 和 Canvas 占用，不改变展示模型 |

## Risks and mitigations

| 风险 | 缓解或验证方式 |
| --- | --- |
| 队列限额导致 UI 丢失部分实时事件 | 发送 `backend:backpressure` 通知；串口读写继续，后续会话式磁盘记录另立 change |
| 更严格 payload 校验拒绝旧客户端 | 当前 Renderer 发送对象 payload；错误明确返回，不静默失败 |
| 重连重构导致无法连接 | 保持既有 URL 与命令，使用 Node 语法检查；Electron 手工 smoke 明确 not-run |
| 无真实设备验证 | 本次不改变字节编码和发送策略，硬件验证如实标 not-run |

## Out of scope

帧解码、环形捕获持久化、虚拟列表、Renderer 模块拆分、自动化 Electron UI 测试。
