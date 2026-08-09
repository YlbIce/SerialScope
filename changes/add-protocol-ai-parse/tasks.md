# Tasks: add-protocol-ai-parse

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| ai.status 默认状态 | ai RPC 集成测试 | Named Pipe 客户端调 `ai.status` | 未返回 enabled=false/mock |
| ai.configure 切换 | 同上 | `ai.configure({enabled:true})` 后 `ai.status` | enabled 未变 true |
| ai.parseProtocol 未启用被拒 | 同上 | 未启用时调用 | 未返回 not-enabled error |
| ai.parseProtocol 启用后解析 | 同上 | 启用后调用 | mock 结果不符 |
| main 白名单只放行 3 个 ai.* | RPC 白名单检查 | 前端 `callBackend('ai.chat')` | 未抛"不允许" |
| 前端校正 UI 保存/导出 | UI 检查 | `npm run check` + 页面手动/脚本验证 | 保存/导出失败 |
| C++ 可构建 | native build | `npm run build:backend` | 编译失败 |
| 既有 native 无回归 | native tests | ai/checksum/frame-decoder tests | 断言失败 |
| change 包合法 | process contract | `npm run process:check` | evidence/结构失败 |
| JS 语法 | syntax check | `npm run check` | 语法失败 |

## Checklist

- [x] 创建 change 包文档
- [x] RED：确认后端无 ai.* 方法、白名单无 ai.*
- [x] 后端 `NamedPipeServer` 注册 ai.status/configure/parseProtocol
- [x] main.js `allowedRpcMethods` 加入 ai.*
- [x] 前端 renderer.js 新增 `#page-protocol` + 校正 UI
- [x] 运行 build/native tests/check/process:check 并写 evidence
- [x] Mode S 提审；本次不归档

## Explicit not-run / blocked

- 真实网络 AI provider：`not-run`，属后续 L3，需显式授权上传。
- 真实串口数据自动解析：`not-run`，本步只做规约文本→配置校正。
- 真实物理串口验证：`not-run`，本步不触碰串口。
