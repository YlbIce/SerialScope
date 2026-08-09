# Specification: add-protocol-import

## Requirement: 文件导入

main 进程 MUST 提供 IPC `file:importProtocol`，打开文件选择器，按扩展名解析文档为纯文本返回。

### Scenario: 导入 docx

- GIVEN 用户选择 `.docx` 文件
- WHEN 调用 `importProtocolFile()`
- THEN 返回 `{ok:true, text:<docx 提取文本>}`（mammoth 解析）

### Scenario: 导入 pdf

- GIVEN 用户选择 `.pdf` 文件
- WHEN 调用 `importProtocolFile()`
- THEN 返回 `{ok:true, text:<pdf 文本层提取>}`（pdf-parse）

### Scenario: 导入 txt/md

- GIVEN 用户选择 `.txt` 或 `.md` 文件
- WHEN 调用 `importProtocolFile()`
- THEN 返回 `{ok:true, text:<文件内容>}`

### Scenario: 取消选择

- GIVEN 用户在文件选择器中取消
- WHEN 调用 `importProtocolFile()`
- THEN 返回 `{ok:false, canceled:true}`，renderer 不报错

## Requirement: renderer 集成

`#page-protocol` 规约输入框 MUST 旁有"导入文档"按钮，点击后调用 `importProtocolFile`，成功时把返回文本填入 `#protocolTextInput`。

### Scenario: 导入填入

- GIVEN 用户点击"导入文档"并选择 docx
- WHEN 返回 `{ok:true, text:"..."}`
- THEN `#protocolTextInput.value` 更新为提取文本

## Requirement: 不支持的文件

非 `.docx`/`.pdf`/`.txt`/`.md` 扩展名 MUST 返回 `{ok:false, message}`，renderer 显示 toast。
