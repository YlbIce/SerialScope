# Proposal: add-protocol-import

## Why

AI 智能串口调试工具 F-007 需求要求用户可上传规约文档（文本/Markdown/**PDF**）。当前 `#page-protocol` 只能手工粘贴文本。用户需要从 Word (.docx) 与 PDF 规约文档直接导入文本到规约输入框。

## What

- 引入文档解析库：`mammoth`（docx，MIT）与 PDF 解析（`pdf-parse`，MIT）。
- main 进程新增 IPC `file:importProtocol`：打开文件选择器（.docx/.pdf/.txt/.md），按扩展名解析为纯文本返回。
- renderer `#page-protocol` 规约输入框旁新增"导入文档"按钮，调用 IPC 并将提取文本填入。

## Non-goals

- 不解析图片型 PDF（扫描件）的 OCR（需额外依赖）。
- 不改 AI 解析逻辑（仅导入文本）。
- 不涉及真实串口/数据上传。

## Acceptance

1. `.docx` 文件经 main 解析为纯文本，填入规约输入框。
2. `.pdf` 文件经 main 解析为纯文本（提取可读文本层）。
3. `.txt`/`.md` 直接读取文本。
4. 取消文件选择不报错。
5. 依赖引入经许可证审查（mammoth MIT、pdf-parse MIT）。

## Risk tier

`L2` — 引入文档解析库与前端导入功能，新增 main IPC 方法（仅读取本地文件返回文本，不涉及串口/网络/上传）。不改安全边界。
