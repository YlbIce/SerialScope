const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.single-${process.pid}-${Date.now()}`;
const root = path.join(__dirname, '..');
const backend = spawn(path.join(root, 'backend', 'bin', 'serialscope-backend.exe'), ['--pipe', pipeName], { stdio: 'ignore' });
const primary = new NamedPipeRpcClient();

(async () => {
  try {
    await primary.connect(pipeName);
    const second = spawnSync(path.join(root, 'backend', 'build', 'serialscope-named-pipe-second-client.exe'), [pipeName], {
      encoding: 'utf8',
      timeout: 5000
    });
    if (second.status !== 0 || second.stdout.trim() !== 'busy') {
      throw new Error(`second client check failed: ${second.stderr || second.stdout}`);
    }
    const ping = await primary.call('backend.ping');
    if (ping.transport !== 'named-pipe') throw new Error('primary client stopped working after second-client rejection');
    console.log('Named Pipe single-client rejection passed');
  } finally {
    primary.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
