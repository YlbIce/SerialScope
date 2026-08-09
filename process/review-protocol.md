# Mode S 审核协议

L2 变更默认使用一次独立只读审核。实施者申请审核时，应提供：

```text
【协议：申请审核】
taskId: <change-id>
reviewRound: 1
rejectCount: 0
fromState: verify-complete
toRole: reviewer
evidence: changes/<change-id>/evidence.md
summary: <范围内实现摘要>
knownLimits: <not-run / blocked / 残余风险>
```

审核者不得修改实现、测试或归档材料，应对照 proposal、specification、tasks 与 evidence，返回：

```text
【协议：审核结论】
taskId: <change-id>
reviewRound: 1
result: approved | conditionally-approved | rejected
checked: []
p1: []
p2: []
limits: []
next: <下一步>
```

- P1 阻断验收，结论必须为 `rejected`。
- P2 不阻断，但必须保留在结论或后续 change 中。
- L3 的自动来回审核使用 Mode L；`rejectCount >= 5` 时停止自动互驱，等待人工介入。
