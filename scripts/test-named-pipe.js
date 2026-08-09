const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const maxMessageBytes = 4 * 1024 * 1024;
const pipeName = `\\\\.\\pipe\\SerialScope.Native.test-${process.pid}-${Date.now()}`;
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
  }
}

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length === 0 || body.length > maxMessageBytes) throw new Error('invalid test message size');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.length, 0);
  socket.write(Buffer.concat([header, body]));
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

function handleMessage(message) {
  if (Array.isArray(message)) {
    if (message.length !== 1 || message[0].id !== 'batch-ping' || message[0].result?.transport !== 'named-pipe') throw new Error('batch request or array params failed');
    console.log('Named Pipe JSON-RPC integration passed');
    finish();
    return;
  }
  if (message.jsonrpc !== '2.0') throw new Error('response is not JSON-RPC 2.0');
  if (message.method === 'backend.ready') {
    ready = true;
    writeMessage({ jsonrpc: '2.0', id: 'ping', method: 'backend.ping', params: {} });
    return;
  }
  if (message.id === 'ping') {
    if (message.result?.transport !== 'named-pipe') throw new Error('backend.ping did not use named-pipe transport');
    writeMessage({ jsonrpc: '2.0', id: 'unknown', method: 'unknown.method', params: {} });
    return;
  }
  if (message.id === 'unknown') {
    if (message.error?.code !== -32601 || message.error?.message !== 'Method not found') throw new Error('unknown method did not return JSON-RPC error');
    writeMessage([
      { jsonrpc: '2.0', id: 'batch-ping', method: 'backend.ping', params: [] },
      { jsonrpc: '2.0', method: 'backend.ping', params: [] }
    ]);
    return;
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
setTimeout(() => finish(new Error('Named Pipe JSON-RPC test timed out')), 8000).unref();
