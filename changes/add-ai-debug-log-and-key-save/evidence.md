# Evidence: add-ai-debug-log-and-key-save

```json
{
  "change": "add-ai-debug-log-and-key-save",
  "riskTier": "L2",
  "recordedAt": "2026-08-09T00:00:00Z",
  "preImplementation": [
    {
      "command": "阅读 src/main/deepseek-provider.js、src/main/ai-config.js、src/main/main.js、src/renderer/index.html、src/renderer/renderer.js",
      "kind": "code-inspection",
      "status": "passed",
      "purpose": "确认 extractJson 解析失败时错误不含原文、AiConfig 仅内存态 Key、ai:config 透传、配置窗口结构",
      "doesNotProve": "DeepSeek 真实网络调用行为"
    },
    {
      "command": "node -e \"try{JSON.parse('[0x05]')}catch(e){console.log('ERROR:', e.message)}\"",
      "kind": "root-cause-analysis",
      "status": "passed",
      "purpose": "复现用户错误：JSON.parse('[0x05]') 报 Expected ',' or ']' after array element，确认 0x 十六进制字面量是 JSON.parse 拒绝的根因",
      "doesNotProve": "DeepSeek 返回内容的多样性"
    }
  ],
  "verification": [
    {
      "command": "node scripts/verify-ai-debug-key-save.js",
      "kind": "unit-test",
      "status": "passed",
      "purpose": "验证 extractJson 对畸形 JSON（数组缺逗号）错误信息含原始文本、合法 JSON 返回结构不变；extractJson 支持 code=[0x05,0x1F,0x10,0x80] 十六进制归一化（0x05→5、0x80→128）且字符串内 0x 不被误改；AiConfig 默认不保存、勾选保存→持久化→重启读回、不勾选→不落盘、显式关闭→移除已存 Key、兼容旧配置",
      "doesNotProve": "真实 DeepSeek 网络畸形返回；配置窗口 UI 交互"
    },
    {
      "command": "npm run check",
      "kind": "syntax-check",
      "status": "passed",
      "purpose": "验证 deepseek-provider.js / ai-config.js / renderer.js 等 JS 语法正确（exitCode 0）",
      "doesNotProve": "运行期行为"
    },
    {
      "command": "npm run process:check",
      "kind": "process-contract",
      "status": "passed",
      "purpose": "验证 L2 change 包结构（含 evidence.md / tasks.md 场景映射 / 合法验证状态）合规",
      "doesNotProve": "功能行为"
    }
  ],
  "residualRisk": [
    "AI 配置窗口（index.html + renderer.js）的 UI 交互未做自动化验证，仅代码审查；已通过语法检查",
    "真实 DeepSeek 返回畸形 JSON 时，错误信息是否完整透传到 UI toast 未端到端验证（依赖 IPC 传参，逻辑上可透传）",
    "将 API Key 写入本地文件为明文存储，用户已显式勾选授权"
  ],
  "handoff": {
    "state": "verify-complete",
    "request": "独立只读审核：核对 deepseek-provider.js 原始文本打印、ai-config.js saveApiKeyToDisk 持久化逻辑、renderer 配置窗口 UI 与回显"
  }
}
```
