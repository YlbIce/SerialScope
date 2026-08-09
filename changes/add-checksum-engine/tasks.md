# Tasks: add-checksum-engine

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 各算法标准向量正确 | ChecksumEngine native tests | `backend/build/serialscope-checksum-engine-tests.exe` | 任一算法输出字节与向量不符 |
| append/verify round-trip | ChecksumEngine native tests | 同上 | 篡改一字节后 verify 仍 true |
| 与现有 Modbus 一致 | ChecksumEngine native tests | 同上 | CRC16_MODBUS 与 crc16Modbus 不一致 |
| NONE/非法类型防御 | ChecksumEngine native tests | 同上 | 抛异常或返回非空 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |
| 现有 JS 语法 | syntax check | `npm run check` | 语法失败 |

## Checklist

- [x] 创建 change 包文档（proposal/design/specification/tasks/evidence/change.json）
- [x] RED：确认当前仅有 crc16Modbus，无多算法校验引擎
- [x] 实现 `ChecksumEngine.{h,cpp}`
- [x] 编写 `backend/tests/ChecksumEngineTests.cpp` 并在 CMake 注册
- [x] 运行 native tests 与 `npm run build:backend`
- [x] 运行 `npm run check`、`npm run process:check` 并写 evidence
- [x] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 真实物理串口验证：`not-run`，校验引擎为纯计算、不触碰串口，且未获设备操作授权。
- 真实设备自动校验填充/验证：`not-run`，属后续 change 范围，需单独授权。
