# Specification: add-checksum-engine

## Requirement: 算法覆盖

`ChecksumEngine` MUST 支持以下 `ChecksumType`，每种在对应标准向量上输出正确校验值：

- `CRC8`：输入 `0x01 0x02 0x03` 输出 `0x48`（多项式 0x07, init 0x00, refin=false, refout=false, xorout=0x00）。
- `CRC16_MODBUS`：输入 `0x01 0x03 0x00 0x00 0x00 0x01` 输出 `0x0A84`（LSB-first，小端字节序 `84 0A`）。
- `CRC16_CCITT`：输入 `"123456789"` 输出 `0x29B1`。
- `CRC16_XMODEM`：输入 `"123456789"` 输出 `0x31C3`。
- `CRC32`：输入 `"123456789"` 输出 `0xCBF43926`。
- `SUM8`：输入 `0x01 0x02 0x03` 输出 `0x06`。
- `SUM16_LE`：输入 `0x01 0x02 0x03 0x04` 输出 `0x0A`，字节序 `0A 00`。
- `SUM16_BE`：输入 `0x01 0x02 0x03 0x04` 输出 `0x0A`，字节序 `00 0A`。
- `XOR`：输入 `0xAA 0x55` 输出 `0xFF`。
- `LRC`：输入 `0x01 0x02 0x03` 输出 `0xFA`（0x100 - 0x06）。
- `NONE`：恒输出空校验字节。

### Scenario: 标准向量

- GIVEN `ChecksumEngine::calculate(data, type)`
- WHEN `data` 为对应标准向量
- THEN 返回与上表一致的字节序列

## Requirement: 追加与验证 round-trip

`append` MUST 把计算出的校验字节追加到帧末尾；`verify` MUST 对刚 `append` 的帧返回通过，对篡改任一校验字节后的帧返回不通过。

### Scenario: 篡改检测

- GIVEN 帧 `frame`，负载 `[0x01, 0x04, 0x00, 0x01]`，`CRC16_MODBUS`
- WHEN `append` 后得到 `[0x01, 0x04, 0x00, 0x01, 0x81, 0xD9]`
- THEN `verify` 返回 true
- AND 将最后一个字节改为 `0xD8` 后 `verify` 返回 false

## Requirement: 与现有 Modbus 入口一致

`ChecksumType::CRC16_MODBUS` 的 `calculate` MUST 与 `protocol::crc16Modbus` 结果一致；`appendModbusCrc` 行为不变。

## Requirement: 防御性

- `NONE` 的 `calculate` 返回空字节，`verify` 恒返回 true。
- 未知/非法 `ChecksumType` 传入 `calculate` MUST 返回空校验字节而不抛异常；`verify` 返回 false。
- `verify` 当 `checksumOffset + checksumSize > frame.size()` 时 MUST 返回 false。
