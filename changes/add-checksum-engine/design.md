# Design: add-checksum-engine

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 代码位置 | 新增 `backend/src/ChecksumEngine.{h,cpp}`，放入 `protocol` 命名空间 | 与 `ProtocolUtils` 同类可复用；不侵入 `SerialSession`，便于独立测试 |
| 现有入口 | 保留 `crc16Modbus`/`appendModbusCrc`，`CRC16_MODBUS` 内部复用 `crc16Modbus` | 向后兼容，避免破坏既有调用方与测试 |
| 算法枚举 | `ChecksumType` 枚举 + 字符串映射（`name()`/`fromName()`） | 便于后续 JSON-RPC 以字符串参数选算法 |
| CRC 系列 | CRC8(0x07, init0, refin/out=false, xorout=0)；CRC16-Modbus(0x8005, init0xFFFF, LSB-first, xorout0)；CRC16-CCITT/XMODEM(0x1021, init0x0000, MSB-first, xorout0)；CRC32(IEEE802.3: 0x04C11DB7, init0xFFFFFFFF, xorout0xFFFFFFFF) | 覆盖工业与常见自定义协议 |
| 简单系列 | SUM8（累加低8位）、SUM16_LE/BE（累加16位大小端）、XOR（逐字节异或）、LRC（0x100-累加） | 常见低成本协议，无需查表 |
| `append` 字节序 | 小端优先：先写低字节 | 与 Modbus CRC 一致，作为默认；CRC 类按各自算法输出字节顺序 |
| `verify` 语义 | 按 `checksumOffset`/`checksumSize` 从帧提取校验字节，与 `calculate` 输出逐字节比对 | 明确、可测；校验字节参与或不参与计算由调用方通过 `payloadEnd` 控制 |
| 错误处理 | `NONE` 恒为 pass；未知算法返回 false 且不抛异常 | 防御性，避免非法配置导致崩溃 |

## Payload 范围语义

- `calculate` 仅对给定 `data` 字节计算，不含校验字节本身。
- `verify` 独立于 `calculate`：提取帧中的校验字节后与 `calculate(frame[0, checksumOffset))` 比较。若校验域紧邻负载且长度已知，这是 round-trip 成立的充分条件。

## Risks

- CRC 参数化（refin/refout、init、xorout、多项式）在本步固定为上述默认；若协议需要非标参数，留作后续可配置扩展，不阻塞本步。
- 未做查表优化，最坏情况为逐位计算；串口数据量级下足够，后续性能优化非本步目标。
- 校验引擎是纯计算，不碰串口；真实设备上的自动填充/验证接入由后续 change 单独评估授权。
