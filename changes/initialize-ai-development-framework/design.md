# Design: initialize-ai-development-framework

## Decisions

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 规则入口 | 根 `AGENTS.md` | 对人类和 Agent 都可见，并能在后续任务中自动加载 |
| 变更包 | `changes/<change-id>/` 五件套加 `change.json` | 保留框架的可读文档，同时为机器校验提供稳定元数据 |
| 证据格式 | `evidence.md` 中嵌入 JSON | 可读且可由无依赖 Node 脚本解析，不只检查文件存在 |
| 自动化范围 | 本地只读检查器 | 初次导入避免新增 CI、网络、真实设备或发布权限 |
| 审核 | L2 默认 Mode S，归档保留人工闸门 | 先建立角色分离，不虚构审核结论 |

## Risks and mitigations

| 风险 | 缓解或验证方式 |
| --- | --- |
| 流程过重导致小改动也创建完整包 | AGENTS.md 明确 L0/L1 短路径 |
| 检查器只检查路径而未校验证据 | 脚本解析 JSON，并校验状态、kind、change 与 riskTier |
| 模板被当作活动变更 | 检查器明确跳过 `changes/_template` |
| 对真实设备的风险被流程掩盖 | 明确 L3 升级条件与人工授权要求 |

## Out of scope

不安装 CI 服务、不生成依赖锁文件、不改业务代码、不执行实际串口操作。
