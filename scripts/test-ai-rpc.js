// 验证后端 ai.* JSON-RPC 方法与 AiAdapter 授权边界。
// 覆盖：ai.status 默认状态、ai.parseProtocol 未启用被拒、ai.chat 未列入被拒、
//       ai.configure 启用、启用后 ai.status 与 ai.parseProtocol mock 结果。
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const maxMessageBytes = 4 * 1024 * 1024;
const pipeName = `\\\\.\\pipe\\SerialScope.Native.ai-test-${process.pid}-${Date.now()}`;
const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: ['ignore', 'ignore', 'pipe'] });
let backendError = '';
backend.stderr.on('data', (chunk) => { backendError += chunk.toString('utf8'); });
let socket = null;
let buffer = Buffer.alloc(0);
let ready = false;
let settled = false;

function finish(error) {
  if (settled) return;
  settled = true;
  if (socket) socket.destroy();
  backend.kill();
  if (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } else {
    console.log('AI RPC integration passed');
  }
}

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length === 0 || body.length > maxMessageBytes) throw new Error('invalid test message size');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
}

function handleMessage(message) {
  if (message.jsonrpc !== '2.0') throw new Error('response is not JSON-RPC 2.0');
  if (message.method === 'backend.ready') {
    ready = true;
    // 1. 默认 ai.status
    writeMessage({ jsonrpc: '2.0', id: 'status-1', method: 'ai.status', params: {} });
    return;
  }
  if (message.id === 'status-1') {
    if (message.error) throw new Error(`ai.status default failed: ${JSON.stringify(message.error)}`);
    const r = message.result;
    if (r.enabled !== false || r.allowDataUpload !== false || r.provider !== 'mock') {
      throw new Error(`ai.status default mismatch: ${JSON.stringify(r)}`);
    }
    // 2. 未启用时 ai.parseProtocol 应被拒
    writeMessage({ jsonrpc: '2.0', id: 'parse-denied', method: 'ai.parseProtocol', params: { text: 'AA 55' } });
    return;
  }
  if (message.id === 'parse-denied') {
    const msg = message.error?.message || '';
    if (!message.error || !msg.includes('not-enabled')) {
      throw new Error(`ai.parseProtocol should be denied when not enabled: ${JSON.stringify(message)}`);
    }
    // 3. 未列入的方法（ai.chat）应被拒（Method not found）
    writeMessage({ jsonrpc: '2.0', id: 'chat-denied', method: 'ai.chat', params: {} });
    return;
  }
  if (message.id === 'chat-denied') {
    if (message.error?.code !== -32601) {
      throw new Error(`ai.chat should be method-not-found: ${JSON.stringify(message.error)}`);
    }
    // 4. 启用 AI（mock 不需上传）
    writeMessage({ jsonrpc: '2.0', id: 'enable', method: 'ai.configure', params: { enabled: true } });
    return;
  }
  if (message.id === 'enable') {
    if (message.error) throw new Error(`ai.configure failed: ${JSON.stringify(message.error)}`);
    const r = message.result;
    if (r.enabled !== true || r.allowDataUpload !== false || r.provider !== 'mock') {
      throw new Error(`ai.configure result mismatch: ${JSON.stringify(r)}`);
    }
    // 5. 启用后 ai.status
    writeMessage({ jsonrpc: '2.0', id: 'status-2', method: 'ai.status', params: {} });
    return;
  }
  if (message.id === 'status-2') {
    if (message.result?.enabled !== true) throw new Error('ai.status after enable mismatch');
    // 6. 启用后 ai.parseProtocol 应返回 mock 结果
    writeMessage({ jsonrpc: '2.0', id: 'parse-ok', method: 'ai.parseProtocol', params: { text: 'AA 55 LEN ...' } });
    return;
  }
  if (message.id === 'parse-ok') {
    if (message.error) throw new Error(`ai.parseProtocol after enable failed: ${JSON.stringify(message.error)}`);
    const r = message.result;
    const headerMatches = Array.isArray(r.header) && r.header.length === 2 && r.header[0] === 0xAA && r.header[1] === 0x55;
    const fieldsOk = Array.isArray(r.fields) && r.fields.length === 2 && r.fields[0].name === 'command';
    if (!headerMatches || r.lengthFieldOffset !== 2 || r.lengthFieldSize !== 1 || !fieldsOk) {
      throw new Error(`ai.parseProtocol mock result mismatch: ${JSON.stringify(r)}`);
    }
    finish();
    return;
  }
}

function readMessages(chunk) {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length === 0 || length > maxMessageBytes) throw new Error(`invalid pipe response length: ${length}`);
    if (buffer.length < 4 + length) return;
    const body = buffer.subarray(4, 4 + length).toString('utf8');
    buffer = buffer.subarray(4 + length);
    handleMessage(JSON.parse(body));
  }
}

function connect(attempt = 0) {
  socket = net.createConnection(pipeName);
  socket.on('data', (chunk) => {
    try { readMessages(chunk); } catch (error) { finish(error); }
  });
  socket.on('error', (error) => {
    if (!settled && error.code === 'ENOENT' && attempt < 30) {
      socket.destroy();
      setTimeout(() => connect(attempt + 1), 50);
      return;
    }
    finish(new Error(`${error.message}${backendError ? `; backend: ${backendError}` : ''}`));
  });
  socket.on('close', () => { if (!settled && ready) finish(new Error('pipe closed unexpectedly')); });
}

connect();
setTimeout(() => finish(new Error('AI RPC test timed out')), 8000).unref();
