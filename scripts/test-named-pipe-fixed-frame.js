const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const frameSize = Number(process.env.SERIALSCOPE_TEST_FRAME_SIZE || 128 * 1024);
if (!Number.isInteger(frameSize) || frameSize < 1 || frameSize > 128 * 1024) {
  throw new Error('SERIALSCOPE_TEST_FRAME_SIZE must be an integer from 1 to 131072');
}
const pipeName = `\\\\.\\pipe\\SerialScope.Native.fixed-${process.pid}-${Date.now()}`;
const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');
const writerPath = path.join(__dirname, '..', 'backend', 'build', 'serialscope-virtual-serial-writer.exe');
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();

function runWriter() {
  const writer = spawn(writerPath, ['COM11', String(frameSize), '921600'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  writer.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  writer.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  return new Promise((resolve, reject) => {
    writer.on('error', reject);
    writer.on('exit', (code) => {
      if (code === 0 && stdout.trim() === String(frameSize)) resolve();
      else reject(new Error(`fixed-frame writer failed (${code}): ${stderr || stdout}`));
    });
  });
}

(async () => {
  try {
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for maximum fixed frame')), 15000);
      client.on('notification', (method, params) => {
        if (method === 'serial.rx' && params.bytes === frameSize) {
          clearTimeout(timer);
          resolve(params);
        }
      });
    });
    await client.connect(pipeName);
    const opened = await client.call('serial.open', {
      portName: 'COM10',
      baudRate: 921600,
      dataBits: 8,
      parity: 'none',
      stopBits: '1',
      flowControl: 'none',
      framing: { mode: 'fixed', frameSize }
    });
    if (!opened.ok) throw new Error(`COM10 fixed-frame open failed: ${opened.message}`);
    await runWriter();
    const payload = await received;
    const tokens = payload.hex.split(' ');
    if (tokens.length !== frameSize || tokens[0] !== '00' || tokens.at(-1) !== 'FF') {
      throw new Error(`fixed-frame payload was truncated or corrupt: ${tokens.length} bytes`);
    }
    await client.call('serial.close');
    console.log(`Named Pipe maximum fixed frame passed (${frameSize} bytes)`);
  } finally {
    client.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
