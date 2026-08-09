# Tasks: initialize-ai-development-framework

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 首次导入前不存在过程检查入口 | `process:check` RED | `npm run process:check` | npm 报 `Missing script` |
| 合法 L2 初始化包可被读取 | `process:check` GREEN | `npm run process:check` | 缺文件或 JSON 字段会失败 |
| 现有 JS 代码未受本次文档/脚本改动破坏 | Node syntax check | `npm run check` | 任一目标出现语法错误 |
| 根约束与流程入口可定位 | 文档检查 | 人工检查 `AGENTS.md` 与 `process/` | 缺少风险、生命周期、审核或仓库地图 |

## Checklist

- [x] RED：记录导入前 `process:check` 缺失
- [x] 创建根约束、流程文档、模板、台账入口与 workflow
- [x] 实现只读变更包检查器并注册 npm 命令
- [x] GREEN：运行 process:check 并记录结果
- [x] 运行现有 JS 语法检查并记录结果
- [x] Mode S：准备只读审核交接；本次不归档

## Explicit not-run / blocked

- 真实串口硬件验证：`not-run`，本次不改产品逻辑且未获得真实设备操作授权。
- 独立 Mode S 审核：`not-run`，当前初始化完成后应由独立只读审核者执行；未取得审核结论前不得归档。
