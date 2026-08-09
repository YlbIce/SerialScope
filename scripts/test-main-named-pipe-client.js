const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.main-client-${process.pid}-${Date.now()}`;
const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: ['ignore', 'ignore', 'pipe'] });
let backendError = '';
backend.stderr.on('data', (chunk) => { backendError += chunk.toString('utf8'); });

(async () => {
  const client = new NamedPipeRpcClient();
  try {
    await client.connect(pipeName);
    const ping = await client.call('backend.ping');
    if (ping.transport !== 'named-pipe') throw new Error('backend.ping transport mismatch');
    let rejected = false;
    try {
      await client.call('unknown.method');
    } catch (error) {
      rejected = error.message === 'Method not found';
    }
    if (!rejected) throw new Error('main Named Pipe client did not reject unknown method');
    console.log('Electron Main Named Pipe RPC client integration passed');
  } finally {
    client.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(`${error.stack || error}${backendError ? `; backend: ${backendError}` : ''}`);
  process.exitCode = 1;
});
