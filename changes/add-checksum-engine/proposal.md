# Proposal: add-checksum-engine

## Why

AI 智能串口调试工具的 F-016/F-017/F-018 需求要求发送时自动计算校验、接收时自动验证校验，并支持 CRC8/CRC16-Modbus/CRC32/校验和/XOR/LRC 等多种算法。当前后端仅提供 `crc16Modbus` 与 `appendModbusCrc` 两种入口（见 `backend/src/ProtocolUtils.h`），无法覆盖绝大多数工业与自定义协议。这是所有 AI 规约解析、命令生成和自动校验功能落地的前提。

## What

在 C++ 后端新增独立校验引擎 `ChecksumEngine`：

- 统一枚举 `ChecksumType`：`CRC8`、`CRC16_MODBUS`、`CRC16_CCITT`、`CRC16_XMODEM`、`CRC32`、`SUM8`、`SUM16_LE`、`SUM16_BE`、`XOR`、`LRC`、`NONE`。
- `calculate(data, type)`：计算给定数据域的校验字节序列。
- `append(frame, type, payloadEnd)`：把校验字节追加到帧（小端优先，与 Modbus 一致）。
- `verify(frame, type, checksumOffset, checksumSize)`：按偏移/长度提取校验并比对，返回是否通过。
- 纯静态内部库，不依赖 Boost/nlohmann 之外的新依赖，不改动现有 Named Pipe / JSON-RPC IPC 契约。

## Non-goals

- 不接入 `serial`/`ai` 等 Named Pipe 方法（本步只实现库与单元测试，公开 IPC 契约不变）。
- 不支持用户自定义脚本校验（F-019，P2，留作后续 change）。
- 不实现校验算法自动识别（F-009 属于 AI 规约解析阶段）。
- 不改变现有 `crc16Modbus`/`appendModbusCrc` 的行为或签名（向后兼容）。

## Acceptance

1. `ChecksumEngine` 对每种支持的算法在已知向量上给出正确结果（CRC32 使用 IEEE 802.3 标准向量 `"123456789" -> 0xCBF43926`；CRC16-Modbus 沿用现有 `crc16Modbus` 一致；CRC8 使用多项式 `0x07`；CRC16-CCITT/XMODEM 使用多项式 `0x1021`）。
2. `append` 与 `verify` 对同一帧 round-trip 通过，篡改一字节后 `verify` 返回 false。
3. 现有 `crc16Modbus` 测试继续通过，`appendModbusCrc` 行为不变。
4. C++ 构建与 native tests 通过；change 包结构合法（`npm run process:check`）。

## Risk tier

`L2` — 新增后端校验引擎库与单元测试，改变可观察的校验计算行为，但不改 IPC 契约、不触碰安全/权限边界、不做真实串口写入。若后续把校验接入真实设备自动发送/验证，需单独按 L2/L3 评估并取得授权。
