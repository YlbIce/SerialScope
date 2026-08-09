# Specification: add-fixed-length-framing

## Requirement: 定长帧

`serial:open.payload.framing.mode=fixed` MUST 要求整数 `frameSize`，范围为 1 至 131072。后端 MUST 跨读取块累计，且每累计 `frameSize` 字节就发出一个包含恰好该长度的 `serial:rx`。上限保证传输事件最坏情况下仍位于 4 MiB WebSocket 实时消息边界内，且与 4 KiB 串口读取缓冲的状态事件背压预算兼容。

### Scenario: 粘连与拆分

- GIVEN COM10 以 fixed/frameSize=4 打开
- WHEN COM11 写入 `01 02 03 04 05 06`
- THEN 后端发出 `01 02 03 04`
- WHEN COM11 再写入 `07 08`
- THEN 后端发出 `05 06 07 08`

### Scenario: 非法长度

- GIVEN `frameSize=0`、非整数或大于 131072
- WHEN 请求打开串口
- THEN 返回失败结果，且不关闭已存在的有效连接
