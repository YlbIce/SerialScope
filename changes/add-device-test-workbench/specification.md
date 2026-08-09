# Specification: add-device-test-workbench

## Requirement: executable communication test case

系统 MUST 允许用户保存由 `start`、`macro`、`read`、`condition`、`loop`、`assert`、`end` 节点和有向边组成的本地测试流程，并一次只执行一个用例。

宏节点 MUST 引用带稳定 ID 和版本的本地宏库项；宏支持查询/写入类别、HEX 或文本报文和文本行尾。流程报告仅快照本次实际消费的宏版本。

工作台规则库 MUST 对 RX 帧的 HEX/文本计算命中名称，规则条件和规则断言 MUST 能据此匹配；不得依赖后端未提供的 `rules` 字段。

条件节点、读取节点和断言节点 MUST 支持结构化字段判定：对于 Modbus RTU 03/04 应答，用户可指定可选从站地址、功能码、读取起始寄存器地址、目标寄存器地址、数据类型和数值比较；对于非 Modbus 二进制协议，用户可指定原始 RX 帧的零基字节偏移、数值类型和比较；文本协议还 MUST 支持正则表达式。字段越界、格式不符或无效正则 MUST 判定为不满足，不能误走真分支。

### Scenario: successful request-response assertion

- GIVEN 已打开的虚拟串口和一个返回 `01 03 04 00 00 00 00 FA 33` 的模拟对端
- WHEN 用例经宏节点发送 `01 03 00 00 00 02 C4 0B`、读取节点等待 RX，条件节点匹配该应答，并执行断言
- THEN 用例和每一步均为 passed，报告包含匹配帧与毫秒级时间。

### Scenario: wait timeout

- GIVEN 对端不返回帧
- WHEN 用例的等待步骤达到配置超时
- THEN 等待步骤和用例为 failed，报告记录 timeout，而后续发送步骤不执行。

### Scenario: guarded conditional loop

- GIVEN 一个读取节点在变量未达到目标值时经过循环节点返回查询宏
- WHEN 连续读取均不满足条件
- THEN 循环只能执行到配置最大次数或最长耗时，之后用例 failed 并停止后续串口写入。

### Scenario: rule branch and reproducible replay

- GIVEN 工作台规则库的 `Modbus 读应答` 规则匹配 RX `01 03 ...`，且流程的条件节点选择 `rule`。
- WHEN 流程读取该帧并走规则为真的边，随后保存报告。
- THEN 报告包含消费帧序号、规则命中、实际宏快照、流程节点/边快照及步骤时序；用户可从报告重新载入流程，并导出 JSON、CSV 或 HTML。

### Scenario: Modbus register comparison

- GIVEN 收到 RTU 应答 `01 03 02 00 64 ...`，配置为从站 1、功能码 03、读取起始地址 0、目标地址 0、无符号 16 位大端、等于 100。
- WHEN 条件节点执行。
- THEN 节点走真分支；若目标地址越界或值不等于 100，则走假分支。

### Scenario: generic binary field

- GIVEN 非 Modbus 报文的目标字段位于零基字节偏移 2，配置为无符号 16 位小端。
- WHEN 该字段解码值与期望数值比较。
- THEN 不依赖特定规约即可决定分支；无效偏移不会满足条件。

## Requirement: reproducible report

每次执行 MUST 生成不可变的结果快照，包含用例版本、步骤结果、耗时与消费的 RX 序列号。

工作台 MUST 显示当前等待条件、运行节点、已走分支、步骤时序、消费帧和失败原因；保存的流程版本和报告快照均可本地载入重放。

## Non-requirements

首版不执行真实设备自动化，也不保证通用多机总线的报文关联。
