# 变更生命周期与门禁

```text
explore → propose → plan/tests → implement → verify → review → archive → memory
```

| 阶段 | 退出条件 | 责任方 |
| --- | --- | --- |
| explore | 问题、选项、风险、开放问题明确 | 任意人，只读 |
| propose | 目标、非目标与验收写入变更包 | 实施者/产品 |
| plan/tests | 任务与“场景—验证”映射存在 | 实施者 |
| implement | 改动未超出规格范围 | 唯一写入实施者 |
| verify | `evidence.md` 包含可复查命令和如实状态 | 实施者 |
| review | 独立审核输出 approved/conditionally-approved/rejected 与 P1/P2 | 只读审核者 |
| archive | 已 review-passed 且获人工归档确认 | 发布负责人 |
| memory | 台账关联 change、证据和提交/归档事实 | 实施者或发布负责人 |

## 门禁

- 机器门禁：`npm run process:check` 必须通过；应用代码变更还须运行映射的测试或诚实记录 `not-run`/`blocked`。
- 协议门禁：L2 不得在无 evidence 时申请审核；L3 不得由审核通过自动触发后续阶段。
- 人工门禁：归档、真实设备写入、发行包/签名、生产相关操作与破坏性 Git 操作。

状态词严格区分：验证用 `passed|failed|blocked|not-run`；审核用 `approved|conditionally-approved|rejected`；生命周期用 `ready-for-review|review-passed|archived`。
