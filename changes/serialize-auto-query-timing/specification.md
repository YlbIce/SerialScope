# Specification: serialize-auto-query-timing

## Requirement: automatic query backpressure

启用自动发送时，应用 MUST 在同一串口上维持至多一个自动查询在途。下一轮 MUST 在当前轮收到 RX 或达到超时后，且满足配置周期后再发送。

### Scenario: 10 ms query with responses

- GIVEN 自动发送周期为 10 ms，COM10/COM11 对端对每个请求返回一帧
- WHEN 前端运行自动查询
- THEN 自动查询状态中的在途数始终为 0 或 1；至少完成 20 个往返后停止，发送数、接收数与对端应答数在静默收敛后相等。

### Scenario: query timeout

- GIVEN 自动发送已启用且对端不返回帧
- WHEN 一轮请求超过配置的应答超时
- THEN 该轮记录超时，且不会创建第二个并行自动查询。

## Requirement: timing evidence

导出日志 MUST 包含毫秒时间和单调顺序号。

### Scenario: same-second events

- GIVEN 同一秒出现多条 TX/RX
- WHEN 导出日志
- THEN CSV 可以按顺序号与毫秒时间确定事件排列。

## Non-requirements

不承诺用通用串口数据自动识别规约级应答关联。
