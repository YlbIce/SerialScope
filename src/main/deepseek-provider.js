// DeepSeek 真实 provider：Node 侧调用 DeepSeek Chat Completions API。
// API Key 从环境变量 DEEPSEEK_API_KEY 读取或运行时传入（内存态），不落盘明文。
const https = require('https');

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 30000;

function callChatCompletions({ apiKey, messages, timeoutMs = DEFAULT_TIMEOUT_MS, maxTokens }) {
  return new Promise((resolve, reject) => {
    const payload = { model: DEEPSEEK_MODEL, messages, temperature: 0.2, stream: false };
    if (Number.isInteger(maxTokens) && maxTokens > 0) payload.max_tokens = maxTokens;
    const body = JSON.stringify(payload);
    const url = new URL(DEEPSEEK_URL);
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: timeoutMs
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk.toString('utf8'); });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`DeepSeek API 错误 ${response.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.message?.content;
          if (typeof content !== 'string' || !content.trim()) {
            reject(new Error('DeepSeek 返回空内容'));
            return;
          }
          resolve(content.trim());
        } catch (error) {
          reject(new Error(`DeepSeek 响应解析失败: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => { request.destroy(new Error(`DeepSeek 调用超时（${timeoutMs}ms）`)); });
    request.on('error', (error) => reject(new Error(`DeepSeek 网络错误: ${error.message}`)));
    request.write(body);
    request.end();
  });
}

function getApiKey(runtimeKey) {
  return runtimeKey || process.env.DEEPSEEK_API_KEY || '';
}

// 提取 JSON 代码块或首段 JSON（支持对象 {} 或数组 [] 顶层）。
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // 定位顶层 JSON 起始（第一个 { 或 [）。
  let start = -1;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === '{' || ch === '[') { start = i; break; }
    if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
      // 遇到非空白、非 JSON 起始字符，跳过（容忍前缀说明文字）。
    }
  }
  if (start === -1) throw new Error('DeepSeek 未返回有效 JSON');
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  // 从 start 开始，按括号配对找到匹配的结束位置。
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('DeepSeek 未返回有效 JSON（括号未闭合）');
  const jsonText = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`DeepSeek 返回 JSON 解析失败: ${error.message}`);
  }
}

const PROTOCOL_SYSTEM_PROMPT = '你是一个专业的串口通信协议解析专家。请分析规约文本，提取帧头、长度域、校验、字段信息，仅输出 JSON（不要额外文字）。格式：{"frame_format":{"header":[字节],"length_field":{"offset":..,"size":..,"includes_header":bool}},"checksum":{"type":"..."},"fields":[{"name":"...","offset":..,"size":..,"type":"uint8","unit":"","description":""}]}';

const COMMAND_SYSTEM_PROMPT = '你是一个串口命令生成专家。根据规约生成读写命令列表，仅输出 JSON 数组。每个命令：{"name":"...","code":[字节],"description":"..."}。';

async function parseProtocolWithDeepSeek({ apiKey, text, includeSerialData, rxFrames = [] }) {
  const key = getApiKey(apiKey);
  if (!key) throw Object.assign(new Error('未配置 DeepSeek API Key'), { code: 'no-api-key' });
  const serialSection = includeSerialData && rxFrames.length > 0
    ? `\n\n最近的串口接收数据：\n${rxFrames.map((f) => (f.hex || f.text || '')).join('\n')}`
    : '';
  const content = `规约文本：\n${text}${serialSection}\n\n请解析为 JSON。`;
  const reply = await callChatCompletions({
    apiKey: key,
    messages: [
      { role: 'system', content: PROTOCOL_SYSTEM_PROMPT },
      { role: 'user', content }
    ]
  });
  return extractJson(reply);
}

async function generateCommandsWithDeepSeek({ apiKey, text, includeSerialData, rxFrames = [] }) {
  const key = getApiKey(apiKey);
  if (!key) throw Object.assign(new Error('未配置 DeepSeek API Key'), { code: 'no-api-key' });
  const serialSection = includeSerialData && rxFrames.length > 0
    ? `\n\n最近的串口接收数据：\n${rxFrames.map((f) => (f.hex || f.text || '')).join('\n')}`
    : '';
  const content = `规约文本：\n${text}${serialSection}\n\n请生成命令列表。`;
  const reply = await callChatCompletions({
    apiKey: key,
    messages: [
      { role: 'system', content: COMMAND_SYSTEM_PROMPT },
      { role: 'user', content }
    ]
  });
  const json = extractJson(reply);
  return Array.isArray(json) ? json : (json.commands || []);
}

// 测试连接：用极小请求验证 Key 有效且能连到 DeepSeek。
async function testConnection({ apiKey }) {
  const key = getApiKey(apiKey);
  if (!key) throw Object.assign(new Error('未配置 DeepSeek API Key'), { code: 'no-api-key' });
  const reply = await callChatCompletions({
    apiKey: key,
    messages: [{ role: 'user', content: 'ping' }],
    timeoutMs: 15000,
    maxTokens: 5
  });
  return { ok: true, reply: (reply || '').slice(0, 200) };
}

module.exports = { parseProtocolWithDeepSeek, generateCommandsWithDeepSeek, testConnection, getApiKey, extractJson };
