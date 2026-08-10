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
      // 累积原始 Buffer，最后一次性按 UTF-8 解码，避免分块边界切断多字节字符
      // 导致 `chunk.toString('utf8')` 将不完整序列解码为 U+FFFD，破坏 JSON 结构。
      const chunks = [];
      response.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
      response.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        // 打印 DeepSeek 原始回复文本流（调试用），便于定位 JSON 畸形输出。
        if (process.env.DEBUG_DEEPSEEK !== '0') {
          console.debug(`[DeepSeek] 原始回复（${data.length} 字符）:\n${data}`);
        }
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

// 把 JSON 文本中"字符串之外"的 0x 十六进制数字字面量替换为十进制。
// 根因：DeepSeek 命令生成的 code 数组常返回 [0x05, 0x1F, ...] 十六进制写法，
// 而 JSON 标准不支持 0x 前缀，JSON.parse 会报 "Expected ',' or ']' after array element"。
// 仅处理字符串外的位置，避免破坏字符串字段内容。
function normalizeHexNumbers(jsonText) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    // 字符串外检测 "0x"/"0X" 十六进制字面量并替换为十进制。
    if (ch === '0' && (jsonText[i + 1] === 'x' || jsonText[i + 1] === 'X')) {
      let j = i + 2;
      let hex = '';
      while (j < jsonText.length && /[0-9a-fA-F]/.test(jsonText[j])) { hex += jsonText[j]; j += 1; }
      if (hex.length > 0) {
        out += String(parseInt(hex, 16));
        i = j - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
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
    // 若首轮失败，尝试把 0x 十六进制字面量归一化为十进制后重试。
    const normalized = normalizeHexNumbers(jsonText);
    if (normalized !== jsonText) {
      try {
        return JSON.parse(normalized);
      } catch (_) {
        // 归一化后仍失败，走下方错误路径（附原始文本便于定位）。
      }
    }
    // 打印原始文本流并纳入错误信息，便于定位畸形输出（如数组元素间缺逗号）。
    const snippet = jsonText.length > 1000 ? `${jsonText.slice(0, 1000)}…（截断，共 ${jsonText.length} 字符）` : jsonText;
    console.error('[DeepSeek] JSON 解析失败，原始文本:', jsonText);
    throw new Error(`DeepSeek 返回 JSON 解析失败: ${error.message}\n原始文本: ${snippet}`);
  }
}

const PROTOCOL_SYSTEM_PROMPT = '你是一个专业的串口通信协议解析专家。请分析规约文本，提取帧头、长度域、校验、字段信息，仅输出 JSON（不要额外文字）。格式：{"frame_format":{"header":[字节],"length_field":{"offset":..,"size":..,"includes_header":bool}},"checksum":{"type":"..."},"fields":[{"name":"...","offset":..,"size":..,"type":"uint8","unit":"","description":""}]}';

const COMMAND_SYSTEM_PROMPT = '你是一个串口命令生成专家。根据规约生成读写命令列表，仅输出 JSON 数组。每个命令：{"name":"...","code":[主体字节，不含校验码],"checksum":"modbus-crc16"|""|"none","description":"..."}。若规约为 Modbus RTU（或使用 CRC16-Modbus 校验），code 只含"从站地址+功能码+数据"，并把 checksum 标为 "modbus-crc16"；否则 code 填完整字节、checksum 填 "none"。校验码由程序本地计算追加，你无需手动计算，但必须如实标注 checksum 类型。';

// 计算 Modbus CRC16（多项式 0xA001，低字节在前），与前端 crc16Modbus / 后端 ChecksumEngine 一致。
function crc16Modbus(bytes) {
  let crc = 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
    }
  }
  return crc & 0xFFFF;
}

// 标准 Modbus 功能码（用于启发式判断命令是否为 Modbus 帧）。
const MODBUS_FUNCTION_CODES = new Set([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0F, 0x10, 0x11, 0x17]);

// 为命令追加本地计算的校验码，保证 Modbus 命令带正确的 CRC16-Modbus。
// 返回新命令数组（不修改入参原对象）。
function ensureCommandChecksum(commands) {
  return (Array.isArray(commands) ? commands : []).map((cmd) => {
    if (!cmd || !Array.isArray(cmd.code)) return cmd;
    const code = cmd.code.map((b) => Number(b)).filter((b) => Number.isInteger(b) && b >= 0 && b <= 255);
    if (code.length === 0) return cmd;
    const checksum = (cmd.checksum || '').toLowerCase();
    // 显式标记 modbus-crc16，或启发式：前两字节为从站地址 + 标准功能码。
    const looksModbus = code.length >= 2 && MODBUS_FUNCTION_CODES.has(code[1]);
    if (checksum === 'modbus-crc16' || (checksum !== 'none' && looksModbus)) {
      const crc = crc16Modbus(code);
      return { ...cmd, code: [...code, crc & 0xFF, (crc >>> 8) & 0xFF], checksum: 'modbus-crc16' };
    }
    return { ...cmd, checksum: checksum || 'none' };
  });
}

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
  const commands = Array.isArray(json) ? json : (json.commands || []);
  // 本地计算并追加校验码，保证 Modbus 命令带正确的 CRC16-Modbus。
  return ensureCommandChecksum(commands);
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

module.exports = { parseProtocolWithDeepSeek, generateCommandsWithDeepSeek, testConnection, getApiKey, extractJson, ensureCommandChecksum, crc16Modbus };
