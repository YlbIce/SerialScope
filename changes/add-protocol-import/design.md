# Design: add-protocol-import

| 决定 | 选择 | 理由 |
| --- | --- | --- |
| 解析库 | `mammoth`（docx，MIT）+ `pdf-parse`（PDF，MIT） | 两者均为宽松 MIT 许可证，解析本地文档文本，无需 OCR |
| 解析位置 | Electron main 进程（新增 IPC `file:importProtocol`） | renderer 用 contextIsolation+nodeIntegration:false，无法直接 require Node 库；main 读取本地文件更安全 |
| 文件选择 | 复用 `dialog.showOpenDialog` | 与现有 `file:openJson` 一致 |
| 支持的扩展名 | `.docx`/`.pdf`/`.txt`/`.md` | 覆盖 Word、PDF、纯文本/Markdown |
| renderer 集成 | `#page-protocol` 规约输入框旁"导入文档"按钮 → `file:importProtocol` → 填入文本 | 最小改动，复用现有输入框 |
| 错误处理 | 解析失败返回 `{ok:false, message}`，renderer 显示 toast | 不崩溃 |

## 数据流

```
renderer #page-protocol "导入文档"按钮
  → window.serialScope.importProtocolFile()
  → main dialog.showOpenDialog({filters: docx/pdf/txt/md})
  → main 读文件 + mammoth/pdf-parse 解析
  → {ok:true, text} 返回 renderer
  → 填入 #protocolTextInput
```

## Risks

- PDF 若为扫描件（无文本层）解析为空，需用户改用可复制文本的 PDF；不引入 OCR。
- 大文件解析可能耗时；本步不做进度条（规约文档通常较小）。
- 引入依赖需在 package.json 记录并审查许可证。
