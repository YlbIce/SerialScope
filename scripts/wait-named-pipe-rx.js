const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.rx-${process.pid}-${Date.now()}`;
const backend = spawn(path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe'), ['--pipe', pipeName], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();

(async () => {
  try {
    await client.connect(pipeName);
    const opened = await client.call('serial.open', {
      portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' }
    });
    if (!opened.ok) throw new Error(opened.message || 'COM10 open failed');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for COM11 input')), 10000);
      client.on('notification', (method, params) => {
        if (method === 'serial.rx' && params.hex === '41 42') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    console.log('Named Pipe COM11-to-COM10 receive passed');
  } finally {
    client.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
