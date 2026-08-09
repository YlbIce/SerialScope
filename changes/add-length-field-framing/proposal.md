# Proposal: add-length-field-framing

## Why

AI 智能串口调试工具的 F-008/F-010 需求要求按帧头特征码 + 长度域实现自适应分帧。当前 `FrameDecoder` 仅支持 `Raw` / `Delimiter` / `Fixed` 三种模式（`backend/src/FrameDecoder.h`），无法处理大量使用"帧头 + 长度域 + 数据 + 校验"的二进制协议（如 Modbus 之外的私有协议、变长帧）。这是后续 AI 规约解析落地分帧配置的落点之一。

## What

在 `FrameDecoder` 新增 `FrameMode::Length` 模式，基于帧头特征码与长度域做动态帧长分帧：

- 配置新增：`header`（帧头特征码）、`lengthFieldOffset`、`lengthFieldSize`、`lengthIncludesHeader`、`lengthEndian`（little/big）、`minFrameSize`、`maxFrameSize`。
- 分帧逻辑：在缓冲中定位 header → 读取长度域 → 计算帧总长 → 累积完整帧后输出，并继续解析剩余字节（粘包/多帧）。
- 保留现有 `Raw` / `Delimiter` / `Fixed` 三种模式行为不变（向后兼容）。
- 纯内部解码，不改 Named Pipe / JSON-RPC IPC 契约。

## Non-goals

- 不接入 `serial`/`ai` 等 Named Pipe 方法（本步只实现 FrameDecoder 模式与单元测试，公开 IPC 契约不变）。
- 不实现 AI 自动生成 header/length 配置（F-009 属于 AI 规约解析阶段）。
- 不支持校验域的剥离或验证（校验已由 add-checksum-engine 独立提供，后续 change 再接线）。
- 不改变 Raw / Delimiter / Fixed 的既有行为。

## Acceptance

1. `FrameMode::Length` 能对"header + length 域 + payload"完整帧正确分帧。
2. 支持粘包（一个 push 含多帧）与半包（帧跨多个 push 累积）场景。
3. `lengthIncludesHeader` 为 true/false 时帧总长计算正确；`lengthEndian` little/big 均正确。
4. 帧长超出 `maxFrameSize`、长度域缺失、非法配置（lengthFieldSize 不支持的值）时防御性丢弃或拒绝，不崩溃、不死循环。
5. 现有 Raw / Delimiter / Fixed 测试继续通过（无回归）。

## Risk tier

`L2` — 新增 FrameDecoder 分帧模式与单元测试，改变可观察的分帧行为，但不改 IPC 契约、不触碰安全/权限边界、不做真实串口写入。若后续把长度分帧接入真实设备解析，需单独评估并取得授权。
