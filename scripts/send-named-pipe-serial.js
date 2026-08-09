const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.tx-${process.pid}-${Date.now()}`;
const backend = spawn(path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe'), ['--pipe', pipeName], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();

(async () => {
  try {
    await client.connect(pipeName);
    const opened = await client.call('serial.open', {
      portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' }
    });
    if (!opened.ok) throw new Error(opened.message || 'COM10 open failed');
    const sent = await client.call('serial.send', { mode: 'hex', data: 'CA FE' });
    if (!sent.ok || sent.bytes !== 2) throw new Error('serial.send failed');
    console.log('Named Pipe serial.send RPC passed');
  } finally {
    client.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
