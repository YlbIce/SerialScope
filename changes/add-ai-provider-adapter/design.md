# Design: add-ai-provider-adapter

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 代码位置 | 新增 `backend/src/AiAdapter.{h,cpp}`，含 `AiProvider`/`AiAdapter`/`MockAiProvider` 与请求响应模型 | 独立模块，便于后续替换/扩展真实 provider |
| provider 抽象 | `AiProvider` 纯虚接口：`chat`/`parseProtocol`/`generateCommands`/`name`/`requiresDataUpload` | 使真实 provider 与 mock 可互换，面向接口 |
| 门面 | `AiAdapter` 持有 `std::shared_ptr<AiProvider>`，管理 `enabled` 与 `allowDataUpload` | 集中授权边界判断，单一入口 |
| 授权开关 | `configure(enabled, allowDataUpload)`；默认均 false | 默认安全：不启用、不上传 |
| 数据上传边界 | 调用 provider 方法前检查：若 `requiresDataUpload()` 且 `!allowDataUpload`，抛 `AiError("data-upload-denied")` | 强制数据不出本机，除非显式授权 |
| mock provider | `MockAiProvider`：本地确定性返回（chat 回显配置文案；parseProtocol 返回固定伪规约；generateCommands 返回固定命令），`requiresDataUpload=false` | 不联网，可测试、可断言 |
| 错误模型 | `AiError` 异常带 `code`；未启用返回 `"not-enabled"` | 后续 IPC 可映射为 JSON-RPC error |
| 依赖 | 仅复用 nlohmann/json，不新增 Boost.Asio HTTP/Beast | 避免引入网络能力，保持"无网络行为"承诺 |
| UI/IPC | 本步不接入；后续 change 再暴露 `ai.*` 方法并加授权 | 缩小变更面，杜绝未授权触发 |

## 授权语义

`AiAdapter` 是数据上传授权的强制边界：
- `enabled=false`：所有调用抛 `not-enabled`。
- `enabled=true` 且 `allowDataUpload=false`：仅允许 `requiresDataUpload()==false` 的 provider 方法；否则抛 `data-upload-denied`。
- mock provider `requiresDataUpload=false`，故本步可在 `enabled=true, allowDataUpload=false` 下正常工作（数据不出本机）。

真实网络 provider（未来）必须 `requiresDataUpload=true`，从而强制要求 `allowDataUpload=true` 才可调用——这是把"串口/AI 数据是否离开本机"的决策显式交还用户。

## Risks

- 本步为接口与 mock，真实 AI 价值待后续 provider 接入后体现；这是安全优先的刻意取舍。
- 若后续在 IPC 暴露 `ai.*` 时忘记经 `AiAdapter` 授权检查，会绕过边界；须在接入 change 中强制复用本门面。
- 未引入真实 HTTP，无网络超时/重试/流式（SSE）能力；这些留待真实 provider 阶段。
