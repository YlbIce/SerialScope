# Specification: add-length-field-framing

## Requirement: 长度分帧

`FrameDecoder` MUST 支持 `FrameMode::Length`。配置 `header`、`lengthFieldOffset`、`lengthFieldSize`、`lengthIncludesHeader`、`lengthEndian`、`minFrameSize`、`maxFrameSize` 后，后端 MUST 定位 `header`，读取长度域，按长度累积完整帧并输出。

### Scenario: 完整帧（lengthIncludesHeader=false，little）

- GIVEN 配置 `header=[0xAA,0x55]`、`lengthFieldOffset=2`、`lengthFieldSize=1`、`lengthIncludesHeader=false`、`lengthEndian=little`
- WHEN `push([0xAA, 0x55, 0x02, 0x11, 0x22])`
- THEN 输出一帧 `[0xAA, 0x55, 0x02, 0x11, 0x22]`
- AND 帧总长 = 2（header）+1（length 域）+2（length 值）= 5

### Scenario: 粘包多帧

- GIVEN 上述配置
- WHEN `push([0xAA,0x55,0x02,0x11,0x22, 0xAA,0x55,0x01,0xFF])`
- THEN 输出两帧 `[0xAA,0x55,0x02,0x11,0x22]`（len=2，总长5）与 `[0xAA,0x55,0x01,0xFF]`（len=1，总长4）

### Scenario: 半包跨 push

- GIVEN 上述配置
- WHEN 首先 `push([0xAA,0x55,0x02,0x11])`（帧头+长度域+部分数据，还差 1 字节 payload）
- THEN 不输出帧
- AND 随后 `push([0x22])`
- THEN 输出一帧 `[0xAA,0x55,0x02,0x11,0x22]`

## Requirement: lengthIncludesHeader 语义

`lengthIncludesHeader=true` 时，帧总长 MUST 等于长度域的值（长度值包含 header 与长度域本身）；`false` 时，帧总长 = `lengthFieldOffset + lengthFieldSize + 长度值`。

### Scenario: includesHeader=true

- GIVEN 配置 `header=[0xAA]`、`lengthFieldOffset=1`、`lengthFieldSize=1`、`lengthIncludesHeader=true`
- WHEN `push([0xAA, 0x04, 0x01, 0x02])`
- THEN 输出一帧 `[0xAA, 0x04, 0x01, 0x02]`（帧总长=4=length 值）

## Requirement: 长度域大小端

`lengthEndian=big` 时，2/4 字节长度域按大端读取；`little` 时按小端读取。

### Scenario: 2 字节大端

- GIVEN 配置 `header=[0xAA]`、`lengthFieldOffset=1`、`lengthFieldSize=2`、`lengthIncludesHeader=false`、`lengthEndian=big`
- WHEN `push([0xAA, 0x00, 0x02, 0x01, 0x02])`
- THEN 输出一帧 `[0xAA, 0x00, 0x02, 0x01, 0x02]`（长度值 0x0002，帧总长=1+2+2=5）

## Requirement: 防御性

- `header` 为空、`lengthFieldSize` 不在 {1,2,4}、`lengthFieldOffset + lengthFieldSize` 超限、`maxFrameSize==0` 时，`push` MUST 置 `overflowed=true` 且不处理（不崩溃、不死循环）。
- 长度值导致帧总长 > `maxFrameSize` 或超过缓冲上限时，MUST 丢弃当前帧、置 `overflowed=true`，并在其后继续搜索下一个 `header`。

### Scenario: 超限帧丢弃后恢复

- GIVEN 配置 `header=[0xAA,0x55]`、`lengthFieldOffset=2`、`lengthFieldSize=1`、`lengthIncludesHeader=false`、`maxFrameSize=5`
- WHEN `push([0xAA,0x55,0x63,0x01, 0xAA,0x55,0x02,0x0A,0x0B])`
- THEN 第一帧（长度 0x63=99，超限）被丢弃并置 `overflowed`
- AND 第二帧 `[0xAA,0x55,0x02,0x0A,0x0B]` 正常输出
