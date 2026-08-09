# Tasks: add-fixed-length-framing

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 读取块不是固定帧 | RED 代码检查 | 检查 FrameDecoder 尚无 fixed 分支 | 无 `frameSize` 处理 |
| 固定长度粘连/拆分 | native + virtual integration | 原生断言与 COM10/COM11 fixed=4 | 帧长度或顺序错误 |
| 非法长度拒绝 | protocol integration | 对后端发送 0、4.5、131073 的 frameSize | 接受无效配置或关闭既有连接 |
| 构建与过程 | build/check/process | 标准定向命令 | 任一失败 |

## Checklist

- [x] RED：确认当前无 fixed 模式
- [x] 实现后端 fixed 模式和配置校验
- [x] 增加 Renderer 定长配置
- [x] 运行原生和虚拟串口验证
- [x] 更新 evidence 并 Mode S 提审

## Explicit not-run / blocked

- 真实物理设备验证：`not-run`，未授权且不在本 change 范围。
