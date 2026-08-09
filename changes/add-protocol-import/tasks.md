# Tasks: add-protocol-import

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| docx 解析 | main 集成测试 | 用示例 docx 调 `file:importProtocol` | 未返回文本 |
| pdf 解析 | 同上 | 用示例 pdf 调 | 未返回文本 |
| txt/md 读取 | 同上 | 用 txt 调 | 未返回内容 |
| 取消选择 | 同上 | 模拟取消 | 返回 canceled 但报错 |
| renderer 导入按钮 | UI 测试 | `npm run test:protocol-ai-ui` 扩展 | 未填入输入框 |
| 依赖许可证 | code-inspection | package.json | 非 MIT 或未记录 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |
| JS 语法 | syntax check | `npm run check` | 语法失败 |

## Checklist

- [x] 创建 change 包文档
- [ ] 安装 mammoth 与 pdf-parse，记录到 package.json
- [ ] main 进程新增 `file:importProtocol` IPC
- [ ] renderer `#page-protocol` 加"导入文档"按钮
- [ ] 扩展 UI 测试覆盖导入
- [ ] 运行 check/process:check 并写 evidence
- [ ] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 扫描型 PDF（无文本层）OCR：`not-run`，不引入 OCR。
- 真实物理串口验证：`not-run`，本步不触碰串口。
