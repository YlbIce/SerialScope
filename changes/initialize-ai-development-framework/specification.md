# Specification: initialize-ai-development-framework

## Requirement: 风险分档与安全边界

仓库 MUST 在根约束中定义 L0–L3、每档最小路径和默认禁止项。涉及真实串口设备写入或改变其安全默认值的任务 MUST 视为 L3 并要求人工闸门。

### Scenario: 不确定的产品行为变更

- GIVEN 实施者无法确定变更是否会改变 IPC、WebSocket 或串口行为
- WHEN 开始规划变更
- THEN 默认记录为 L2
- AND 在 change 包中声明升级信号

### Scenario: 真实设备写入

- GIVEN 某项验证或实现将向真实串口设备发送可能有影响的命令
- WHEN 准备执行该操作
- THEN 必须按 L3 处理并等待人工授权
- AND 不得以本地语法检查替代硬件验证

## Requirement: 可校验的 L2/L3 变更包

L2/L3 change MUST 包含 proposal、design、specification、tasks、evidence 与 `change.json`。evidence MUST 含有可解析 JSON，且每项验证 MUST 包含 command、kind、status、purpose 与 doesNotProve。

### Scenario: 合法变更包

- GIVEN 一个 L2 change 具备必需文件和合法证据 JSON
- WHEN 运行 `npm run process:check`
- THEN 命令成功
- AND 输出已检查 change 的数量

### Scenario: 缺少证据字段

- GIVEN 一个活动 change 的验证记录缺少 kind 或包含未知 status
- WHEN 运行 `npm run process:check`
- THEN 命令失败
- AND 输出可定位的 change 与字段错误

## Non-requirements

本 change 不证明现有产品功能、C++ 构建、Electron 启动或真实串口设备兼容性。
