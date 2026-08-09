const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient, MAX_MESSAGE_BYTES } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.boundary-${process.pid}-${Date.now()}`;
const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectRaw() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = net.createConnection(pipeName);
        socket.once('connect', () => resolve(socket));
        socket.once('error', reject);
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(50);
    }
  }
  throw new Error('Named Pipe did not become available');
}

(async () => {
  let raw;
  const client = new NamedPipeRpcClient();
  try {
    raw = await connectRaw();
    raw.on('error', () => {});
    const oversizedHeader = Buffer.allocUnsafe(4);
    oversizedHeader.writeUInt32LE(MAX_MESSAGE_BYTES + 1, 0);
    raw.write(oversizedHeader);
    await new Promise((resolve) => {
      raw.once('close', resolve);
    });

    await client.connect(pipeName);
    const ping = await client.call('backend.ping');
    if (ping.transport !== 'named-pipe') throw new Error('server did not recover after oversized frame');
    console.log('Named Pipe oversized-frame rejection and recovery passed');
  } finally {
    if (raw) raw.destroy();
    client.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
