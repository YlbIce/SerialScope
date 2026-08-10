// 验证变更 add-ai-debug-log-and-key-save：
// 1) extractJson 对畸形 JSON 的错误信息包含原始文本；
// 2) AiConfig 的 saveApiKeyToDisk 保存/读取/移除行为。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractJson } = require('../src/main/deepseek-provider.js');
const { AiConfig } = require('../src/main/ai-config.js');

// ---- 1. extractJson：畸形 JSON（数组元素间缺逗号）----
const malformed = '我生成的命令如下：\n```json\n[{"name":"读","code":[0x01,0x03]}{"name":"写","code":[0x01,0x06]}]\n```';
let extractErr = null;
try {
  extractJson(malformed);
} catch (error) {
  extractErr = error;
}
assert(extractErr, '畸形 JSON 应抛错');
assert(/原始文本:/.test(extractErr.message), '错误信息应包含原始文本，实际: ' + extractErr.message);
assert(/\[1\]/.test(extractErr.message) || /原始文本:/.test(extractErr.message), '原始文本应进入错误信息');
console.log('[1] extractJson 畸形 JSON 错误信息含原始文本: PASS');

// ---- 1b. extractJson：合法 JSON 返回结构不变 ----
const valid = extractJson('[{"name":"读","code":[1,3]}]');
assert(Array.isArray(valid) && valid[0].name === '读', '合法 JSON 应正常解析');
console.log('[1b] extractJson 合法 JSON 返回结构不变: PASS');

// ---- 2. AiConfig：默认不保存 ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-config-test-'));
const cfg = new AiConfig(tmpDir);
assert.strictEqual(cfg.saveApiKeyToDisk, false, '默认 saveApiKeyToDisk 应为 false');
assert.strictEqual(cfg.getSnapshot().hasPersistedApiKey, false, '默认无持久化 Key');
console.log('[2] AiConfig 默认不保存: PASS');

// ---- 3. 勾选保存 → 持久化，重新加载可读回 ----
const key1 = 'sk-test-123';
cfg.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey: key1, saveApiKeyToDisk: true });
const raw1 = JSON.parse(fs.readFileSync(path.join(tmpDir, 'ai-config.json'), 'utf8'));
assert.strictEqual(raw1.saveApiKeyToDisk, true, '配置文件应记录 saveApiKeyToDisk:true');
assert.strictEqual(raw1.savedApiKey, key1, '配置文件应记录 savedApiKey');
// 重新实例化（模拟下次启动）
const cfgReload = new AiConfig(tmpDir);
assert.strictEqual(cfgReload.getApiKey(), key1, '重启后应能从配置文件读回 Key');
assert.strictEqual(cfgReload.getSnapshot().keySource, 'saved', 'Key 来源应为 saved');
assert.strictEqual(cfgReload.getSnapshot().hasPersistedApiKey, true, '应报告有持久化 Key');
console.log('[3] 勾选保存→持久化→重启读回: PASS');

// ---- 4. 不勾选 → 不落盘明文 ----
const cfg2 = new AiConfig(tmpDir);
cfg2.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey: 'sk-temp-999', saveApiKeyToDisk: false });
const raw2 = JSON.parse(fs.readFileSync(path.join(tmpDir, 'ai-config.json'), 'utf8'));
assert.strictEqual(raw2.saveApiKeyToDisk, false, 'saveApiKeyToDisk 应为 false');
assert.strictEqual(raw2.savedApiKey, undefined, '不应落盘明文 Key');
// 内存态仍可用
assert.strictEqual(cfg2.getApiKey(), 'sk-temp-999', '内存态 Key 应可用');
console.log('[4] 不勾选→不落盘明文: PASS');

// ---- 5. 显式关闭 → 移除已存 Key ----
cfg2.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey: 'sk-new', saveApiKeyToDisk: true });
assert(fs.readFileSync(path.join(tmpDir, 'ai-config.json'), 'utf8').includes('sk-new'), '先保存新 Key');
cfg2.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey: 'sk-new', saveApiKeyToDisk: false });
const raw3 = JSON.parse(fs.readFileSync(path.join(tmpDir, 'ai-config.json'), 'utf8'));
assert.strictEqual(raw3.savedApiKey, undefined, '显式关闭应移除 savedApiKey');
assert.strictEqual(cfg2.getSnapshot().hasPersistedApiKey, false, '应报告无持久化 Key');
console.log('[5] 显式关闭→移除已存 Key: PASS');

// ---- 6. 兼容旧配置（无新字段）----
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-config-old-'));
fs.writeFileSync(path.join(tmp2, 'ai-config.json'), JSON.stringify({ provider: 'deepseek', enabled: true, allowDataUpload: true }));
const cfgOld2 = new AiConfig(tmp2);
assert.strictEqual(cfgOld2.saveApiKeyToDisk, false, '旧配置无该字段时默认 false');
assert.strictEqual(cfgOld2.savedApiKey, '', '旧配置无 savedApiKey');
console.log('[6] 兼容旧配置（无新字段）: PASS');

// ---- 7. extractJson 支持 0x 十六进制字面量（真实根因）----
// DeepSeek 命令生成返回的 code 数组常为 [0x05, 0x1F, ...] 十六进制写法，
// JSON 标准不支持 0x 前缀，JSON.parse 会报 "Expected ',' or ']' after array element"。
// extractJson 应将其归一化为十进制后成功解析。
const hexJson = '[{"name":"采集UPS系统反馈状态(遥信)","code":[0x05,0x1F,0x10,0x80],"description":"RTU"}]';
const parsedHex = extractJson(hexJson);
assert(Array.isArray(parsedHex), '0x 数组应解析为数组');
assert.strictEqual(parsedHex[0].code[0], 0x05, '0x05 应归一化为 5');
assert.strictEqual(parsedHex[0].code[3], 0x80, '0x80 应归一化为 128');
assert.strictEqual(parsedHex[0].name, '采集UPS系统反馈状态(遥信)', '字符串内中文应保持');
console.log('[7] extractJson 支持 0x 十六进制字面量: PASS');

// ---- 7b. 字符串内的 "0x..." 不应被误改 ----
const withStrHex = '{"hint":"使用 0x1F 表示目标地址","v":[0x1F,0x20]}';
const parsedStrHex = extractJson(withStrHex);
assert.strictEqual(parsedStrHex.hint, '使用 0x1F 表示目标地址', '字符串内 0x1F 应原样保留');
assert.strictEqual(parsedStrHex.v[0], 0x1F, '数组值 0x1F 应归一化为 31');
console.log('[7b] 字符串内 0x 不被误改，数组内 0x 正确归一化: PASS');

console.log('\n全部验证通过 ✓');
process.exit(0);
