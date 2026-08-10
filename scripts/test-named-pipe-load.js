const assert = require('assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const root = path.join(__dirname, '..');
const frames = Number(process.env.SERIALSCOPE_LOAD_FRAMES || 1000);
const backendPath = process.env.SERIALSCOPE_BACKEND || path.join(root, 'backend', 'bin', 'serialscope-backend.exe');
const pipeName = `\\\\.\\pipe\\SerialScope.Native.load-${process.pid}-${Date.now()}`;
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();
let received = 0;
const sequences = [];
client.on('notification', (method, params) => {
  if (method === 'serial.rx' && params.bytes === 5) {
    received += 1;
    sequences.push(params.sequence);
  }
});

(async () => {
  try {
    await client.connect(pipeName);
    const opened = await client.call('serial.open', { portName: 'COM10', baudRate: 921600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'delimiter', delimiter: 'LF' } });
    assert.equal(opened.ok, true);
    const writer = spawn(path.join(root, 'backend', 'build', 'serialscope-virtual-serial-burst-writer.exe'), ['COM11', String(frames), '921600'], { stdio: 'ignore' });
    await new Promise((resolve, reject) => writer.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`burst writer failed (${code})`))));
    const deadline = Date.now() + 15000;
    while (received < frames && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    const state = await client.call('serial.status');
    assert.equal(received, frames, `expected ${frames} decoded frames, got ${received}; backend reports ${state.rxFrames}; last notification sequence ${sequences.at(-1)}`);
    assert.ok(state.rxFrames >= frames && state.rxBytes >= frames * 5);
    await client.call('serial.close');
    console.log(`Named Pipe 921600-bps short-frame load passed (${frames} frames)`);
  } finally { client.close(); backend.kill(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
