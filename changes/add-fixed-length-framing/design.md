# Design: add-fixed-length-framing

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 模式名 | `fixed` | 与 `raw`、`delimiter` 对称且清晰 |
| 配置字段 | `framing.frameSize`，范围 1–131072 | 后端一次性验证，避免无界缓存，并降低旧实时队列的单事件压力 |
| 实现 | 重用 FrameDecoder 的固定 1 MiB 数组 | 不增加新的动态累计内存 |
| UI | 选择 fixed 时显示数值输入；其他模式隐藏 | 减少无关配置 |

fixed 模式不会等待分隔符；缓冲满 `frameSize` 即发出并继续处理同一读取块内的剩余字节。

当前 WebSocket 链路的最大帧端到端交付未通过；后续 Named Pipe 迁移将以新的消息边界重新定义并验证这一限制。
