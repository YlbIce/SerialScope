# Tasks: add-deepseek-provider

## L3 阶段与人工闸门

| 阶段 | 人工闸门 | 状态 |
| --- | --- | --- |
| G1 方案确认 | 用户确认（方案A/userData/含串口数据） | 已完成 |
| G2 design/specification 评审 | 独立评审通过 | 待 |
| 实现（Mode P） | — | 待 G2 |
| 验证（真实 Key 端到端 / mock 回退） | — | 实现后 |
| G3 独立审核 + 归档确认 | approved + 用户授权 | 待实现后 |

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 配置持久化（不含 Key） | AI 配置集成测试 | 设 provider/enabled 后读 ai-config.json | Key 被写入 |
| 无 Key 回退 mock | 集成测试 | 无 DEEPSEEK_API_KEY 调 parseProtocol | 未回退/报错 |
| 有 Key 真实调用 | 端到端 | 设 DEEPSEEK_API_KEY 调 DeepSeek | 未返回真实结果 |
| 禁止上传拒绝 | 集成测试 | allowDataUpload=false 上传串口数据 | 未拒绝 |
| 配置窗口 UI | UI 测试 | 配置窗口操作 | 未持久化/无风险提示 |
| API 失败明确 error | 集成测试 | mock DeepSeek 返回错误 | 静默回退 mock |

## Checklist

- [x] 创建 change 包文档
- [ ] G2 独立评审通过
- [ ] 实现 deepseek-provider.js（Node https 调 DeepSeek）
- [ ] 实现 ai-config 持久化 + 真实/回退判断
- [ ] 前端 AI 配置窗口
- [ ] 验证配置/mock 回退/真实调用/上传拒绝/API 失败
- [ ] G3 独立审核；不自动归档

## Explicit not-run / blocked

- 真实 DeepSeek 调用：取决于用户是否提供 `DEEPSEEK_API_KEY` 环境变量；无 Key 时仅验证 mock 回退。
- 真实物理串口数据上传：需用户授权 + 场景；虚拟串口数据可用于测试。
