const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { NamedPipeRpcClient, MAX_MESSAGE_BYTES } = require('../src/main/named-pipe-rpc');

const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function frame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function startBackend(label) {
  const pipeName = `\\\\.\\pipe\\SerialScope.Native.outbound-${label}-${process.pid}-${Date.now()}`;
  const backend = spawn(backendPath, ['--pipe', pipeName], {
    stdio: 'ignore',
    env: { ...process.env, SERIALSCOPE_TEST_MODE: '1' }
  });
  return { backend, pipeName };
}

async function connectRaw(pipeName) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const socket = await new Promise((resolve, reject) => {
        const candidate = net.createConnection(pipeName);
        candidate.once('connect', () => resolve(candidate));
        candidate.once('error', reject);
      });
      const messages = [];
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const length = buffer.readUInt32LE(0);
          if (length === 0 || length > MAX_MESSAGE_BYTES || buffer.length < length + 4) return;
          const body = buffer.subarray(4, length + 4);
          buffer = buffer.subarray(length + 4);
          messages.push({ length, message: JSON.parse(body.toString('utf8')) });
        }
      });
      return { socket, messages };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(40);
    }
  }
  throw new Error('Named Pipe did not become available');
}

async function waitFor(messages, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(predicate);
    if (found) return found;
    await delay(10);
  }
  throw new Error('timed out waiting for Named Pipe message');
}

async function assertExactBoundary() {
  const { backend, pipeName } = startBackend('exact');
  let raw;
  try {
    raw = await connectRaw(pipeName);
    await waitFor(raw.messages, (entry) => entry.message.method === 'backend.ready');
    const id = 'exact-boundary';
    const emptyResponse = { jsonrpc: '2.0', id, result: { payload: '' } };
    const payloadBytes = MAX_MESSAGE_BYTES - Buffer.byteLength(JSON.stringify(emptyResponse), 'utf8');
    raw.socket.write(frame({ jsonrpc: '2.0', id, method: 'backend.testPayload', params: { bytes: payloadBytes } }));
    const exact = await waitFor(raw.messages, (entry) => entry.message.id === id, 10000);
    if (exact.length !== MAX_MESSAGE_BYTES || exact.message.result?.payload?.length !== payloadBytes) {
      throw new Error(`exact 4 MiB response mismatch: ${exact.length}`);
    }

    raw.socket.write(frame({ jsonrpc: '2.0', id: 'overflow-boundary', method: 'backend.testPayload', params: { bytes: payloadBytes + 1 } }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('oversized outbound response did not disconnect')), 5000);
      raw.socket.once('close', () => { clearTimeout(timer); resolve(); });
    });

    const recovery = new NamedPipeRpcClient();
    try {
      await recovery.connect(pipeName);
      const ping = await recovery.call('backend.ping');
      if (ping.transport !== 'named-pipe') throw new Error('server did not recover after outbound overflow');
    } finally {
      recovery.close();
    }
    console.log('Named Pipe exact 4 MiB outbound boundary and recovery passed');
  } finally {
    raw?.socket.destroy();
    backend.kill();
  }
}

async function assertSlowClientDisconnect() {
  const { backend, pipeName } = startBackend('slow');
  const slowClientPath = path.join(__dirname, '..', 'backend', 'build', 'serialscope-named-pipe-slow-client.exe');
  let slowClient;
  try {
    const id = 'slow-client';
    const emptyResponse = { jsonrpc: '2.0', id, result: { payload: '' } };
    const payloadBytes = MAX_MESSAGE_BYTES - Buffer.byteLength(JSON.stringify(emptyResponse), 'utf8');
    const started = Date.now();
    slowClient = spawn(slowClientPath, [pipeName, String(payloadBytes)], { stdio: 'ignore' });
    await delay(3000);
    const elapsed = Date.now() - started;
    if (elapsed < 1500 || elapsed > 5500) throw new Error(`slow-client timeout was not bounded: ${elapsed}ms`);

    const recovery = new NamedPipeRpcClient();
    try {
      await recovery.connect(pipeName);
      const ping = await recovery.call('backend.ping');
      if (ping.transport !== 'named-pipe') throw new Error('server did not recover after slow client disconnect');
    } finally {
      recovery.close();
    }
    await new Promise((resolve, reject) => {
      slowClient.once('error', reject);
      slowClient.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`slow client exited ${code}`)));
    });
    console.log('Named Pipe slow-client timeout and recovery passed');
  } finally {
    slowClient?.kill();
    backend.kill();
  }
}

(async () => {
  await assertExactBoundary();
  await assertSlowClientDisconnect();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
