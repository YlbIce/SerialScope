# Design: add-length-field-framing

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 代码位置 | 扩展现有 `FrameDecoder.{h,cpp}`，新增 `FrameMode::Length` 分支 | 与 Raw/Delimiter/Fixed 同处一状态机，复用同一 `buffer_`/`bufferedSize_`，便于统一分帧边界 |
| 帧头特征码 | `header`（`protocol::Bytes`），在缓冲中用 `std::search` 定位 | 复用 delimiter 的搜索机制，覆盖常见二进制协议 |
| 长度域偏移 | `lengthFieldOffset`：长度域相对帧起始（含 header）的字节偏移 | 对齐需求文档 `FrameConfig.lengthFieldOffset` |
| 长度域宽度 | `lengthFieldSize`：1 / 2 / 4 字节；2/4 字节支持 `lengthEndian` little/big | 覆盖大多数协议；宽度决定读法 |
| 帧总长计算 | `lengthIncludesHeader=true` 时帧总长=长度值；`false` 时=长度域偏移+长度域宽+长度值 | 对齐需求文档 `lengthIncludesHeader` 语义 |
| 配置校验 | header 非空、lengthFieldSize ∈ {1,2,4}、lengthFieldOffset≥0、maxFrameSize>0，否则返回 overflowed 且不处理 | 防御非法配置，避免死循环/越界 |
| 越界/超限 | 帧总长 > `maxFrameSize` 或超过缓冲上限时，丢弃当前帧并重置到 header 搜索状态，置 `overflowed` | 与 delimiter 的超限丢弃语义一致 |
| 粘包/半包 | 单次 push 内循环提取多帧；跨 push 由 `bufferedSize_` 保留未完成状态 | 与 Fixed/Delimiter 一致，复用缓冲 |
| UI | 本步不接 UI；`length` 模式由后续配置面板或 AI 解析生成 | 聚焦解码正确性，缩小变更面 |

## 状态机

`Length` 模式为隐式状态，由 `bufferedSize_` 与"是否已找到 header"推断：

1. 在缓冲中 `std::search` 定位 `header`。
2. 未找到 header：丢弃 header 之前的字节（作为噪声/粘包前导），保留 header 起始之后的缓冲。
3. 找到 header 后，若 `header.lengthFieldOffset + lengthFieldSize` 超出当前缓冲，等待更多数据（半包）。
4. 长度域齐全后计算帧总长；若超出 `maxFrameSize`，置 `overflowed` 并丢弃到 header 之后继续搜索下一个 header。
5. 帧总长数据未齐则等待；已齐则输出整帧，移除，重复直到缓冲耗尽。

## Risks

- header 若出现在 payload 内可能误触发分帧；本步要求真实帧以 header 起始（调用方保证），payload 内的伪 header 属于误分帧边界，交由后续 AI/规则层处理。
- 长度域缺失或损坏的帧会被丢弃并置 `overflowed`，属受控退化，不是静默内存增长。
- 未做跨 push 的 header 半匹配优化（header 被切分在两次 push 边界）：`std::search` 在每次 push 的缓冲上运行，天然覆盖该情况，因为缓冲保留未消费字节。
