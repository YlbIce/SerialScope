# Evidence: add-protocol-import

```json
{
  "change": "add-protocol-import",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "检查 package.json 与 #page-protocol 输入框",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认当前无文档解析依赖、规约输入框仅支持手工粘贴",
      "doesNotProve": "add-protocol-import 的目标行为"
    }
  ],
  "remediation": [
    {
      "command": "npm run test:protocol-import 首次运行",
      "kind": "integration-test",
      "status": "failed",
      "purpose": "发现 pdfjs standardFontDataUrl 需正斜杠结尾（Windows 反斜杠路径导致 Invalid factory url）",
      "doesNotProve": "PDF 提取逻辑失败",
      "observed": "已修复为 URL 形式（正斜杠替换）；pdf-parse v2 因 @napi-rs/canvas 原生绑定失败弃用，改用 pdfjs-dist legacy + DOMMatrix polyfill"
    }
  ],
  "verification": [
    {
      "command": "npm run test:protocol-import",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "验证 txt/md/pdf 文本提取与不支持类型拒绝",
      "doesNotProve": "真实 Word/PDF 文档兼容性（docx 未用真实文件测，pdf 用最小样本）"
    },
    {
      "command": "npm run test:protocol-ai-ui",
      "kind": "ui-test",
      "status": "passed",
      "purpose": "验证导入按钮调用 file:importProtocol 并填入规约输入框",
      "doesNotProve": "真实文件对话框交互（mock 返回）"
    },
    {
      "command": "npm run test:ai-rpc / test:mcp-handshake / test:mcp-authorization",
      "kind": "integration-test",
      "status": "passed",
      "purpose": "确认既有 AI/MCP 测试无回归",
      "doesNotProve": "导入行为"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "验证 JS 语法（含新 protocol-import.js 与 MCP 模块）",
      "doesNotProve": "Electron UI 行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "验证 change 包结构与 evidence JSON（21 个活动 change）",
      "doesNotProve": "产品行为"
    }
  ],
  "residualRisk": [
    "扫描型 PDF（无文本层）解析为空，不引入 OCR",
    "docx 提取用 mammoth extractRawText，未用真实复杂 docx 测（示例文件）",
    "pdf-parse v2 因 @napi-rs/canvas 原生绑定在当前环境失败而弃用，改用 pdfjs-dist legacy"
  ],
  "handoff": {
    "state": "ready-for-review",
    "request": "核对 mammoth/pdfjs 文本提取、file:importProtocol IPC、renderer 导入按钮与证据范围"
  }
}
```
