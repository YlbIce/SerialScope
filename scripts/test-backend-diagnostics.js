const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const root = path.join(__dirname, '..');
const backendPath = path.join(root, 'backend', 'build', 'serialscope-backend.exe');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-backend-diagnostics-'));
const runId = `backend-test-${process.pid}`;
const pipeName = `\\\\.\\pipe\\SerialScope.Native.diagnostics-${process.pid}-${Date.now()}`;
const backend = spawn(backendPath, ['--pipe', pipeName, '--diagnostics-dir', directory, '--diagnostics-run-id', runId], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();

(async () => {
  try {
    await client.connect(pipeName);
    await client.call('backend.ping');
    await client.call('serial.status');
    const files = fs.readdirSync(directory).filter((name) => name.endsWith('.jsonl'));
    assert.equal(files.length, 1, 'backend must write one diagnostic stream for the run');
    const entries = fs.readFileSync(path.join(directory, files[0]), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(entries.some((entry) => entry.runId === runId && entry.event === 'backend-start'));
    assert.ok(entries.some((entry) => entry.event === 'rpc-request' && entry.details.method === 'serial.status'));
    assert.ok(entries.every((entry) => entry.source === 'backend' && entry.timestamp));
    console.log('C++ 后端诊断：runId、请求元数据与 JSONL 持久化验证通过');
  } finally {
    client.close();
    backend.kill();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
