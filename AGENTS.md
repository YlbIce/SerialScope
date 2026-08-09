# SerialScope Agent 项目约束

本文件是本仓库内人类与 AI Agent 的共同开发约束。它规范变更过程，不替代产品需求、代码审查或真实设备安全规程。

## 风险分档（先分档，再选流程）

| 档位 | 适用范围 | 最小路径 | 默认禁止 |
| --- | --- | --- | --- |
| L0 | 文案、格式、注释、无语义文档修正 | 直改 → 目视验证 → 记录 | 完整变更包、多 Agent |
| L1 | 局部实现或测试，公开契约不变 | 简短意图 → 定向验证 → 记录 | 完整 design/specification、Mode L/P |
| L2 | 可观察行为、IPC/WebSocket 契约、跨模块改动 | 变更包 → 场景映射/测试先行 → 证据 → Mode S | 无证据归档、Mode P |
| L3 | 真实串口设备写入、安全/权限边界、发布、迁移、多阶段编排 | 完整生命周期 → Mode L/P → 人工闸门 | 自动归档、自动推进下一阶段、状态洗白 |

不确定时按 L2 起步；下调风险档位需要项目负责人确认。使用真实设备发送控制、配置或可能造成物理影响的命令，及改变其默认安全边界时，必须按 L3 处理。

## 变更与状态

- L2/L3 使用 `changes/<change-id>/`，至少包含 `proposal.md`、`design.md`、`specification.md`、`tasks.md`、`evidence.md` 与 `change.json`。
- 新变更从 `changes/_template/` 复制；`npm run process:check` 会验证活动变更包，并解析 `evidence.md` 内的 JSON 证据块。
- 有效验证状态只有：`passed`、`failed`、`blocked`、`not-run`。不得互换或省略失败边界。
- `review-passed` 不等于 `archived`，更不等于下一阶段已启动。归档、发布、真实外部写入和破坏性 Git 操作都需要人工确认。

## 验证与证据

- 先运行与本次验收直接对应的定向命令；全量套件不能替代场景映射。
- 每项证据必须记录命令、`kind`、`status`、证明范围与未证明范围（或原因）。
- L2/L3 完成实现后进入 `ready-for-review`，由独立只读审核给出 `approved`、`conditionally-approved` 或 `rejected`，并列明 P1/P2。
- 真实串口验证必须写明设备、连接参数、操作授权与观察范围；没有授权不得实际发送或修改设备状态。

## 协作与写入

- 同一工作区同一时刻只允许一个实施者写入；并行写入必须使用独立 branch/worktree。
- L0/L1 默认不启用多 Agent；L2 默认 Mode S（实施者写入、审核者只读）；L3 才按需使用 Mode L/P，连续拒绝达到 5 次后停止自动互驱并请求人工介入。
- 审核者不得“顺手修复”实现或测试；其职责是根据变更包和证据给出可复核结论。

## 仓库入口

- `npm run check`：现有 JavaScript 语法检查。
- `npm run process:check`：检查活动 L2/L3 变更包与机器可读证据。
- `npm run build:backend`：构建 C++ 后端；依赖本机 Visual Studio、CMake、vcpkg。
- `npm run dev`：启动桌面应用；它不等价于真实串口硬件验证。

提交前在 `knowledge/work-summary.md` 记录变更、验证与残余风险；L0/L1 可极简，L2/L3 必须关联 change 与 evidence。
