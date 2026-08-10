const assert = require('assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const root = path.join(__dirname, '..');
const backendPath = process.env.SERIALSCOPE_BACKEND || path.join(root, 'backend', 'bin', 'serialscope-backend.exe');
const pipeName = `\\\\.\\pipe\\SerialScope.Native.lifecycle-${process.pid}-${Date.now()}`;
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();
const notifications = [];
client.on('notification', (method, params) => notifications.push({ method, params }));

const waitFor = (predicate, timeoutMs = 5000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const tick = () => {
    const found = notifications.find(predicate);
    if (found) return resolve(found);
    if (Date.now() - started > timeoutMs) return reject(new Error('timed out waiting for protocol lifecycle notification'));
    setTimeout(tick, 20);
  };
  tick();
});
const helper = (name, args) => new Promise((resolve, reject) => {
  const child = spawn(path.join(root, 'backend', 'build', `${name}.exe`), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', (value) => { output += value; }); child.stderr.on('data', (value) => { error += value; });
  child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${name} failed (${code}): ${error || output}`)));
});

(async () => {
  try {
    await client.connect(pipeName);
    const invalidOpen = await client.call('serial.open', {});
    assert.equal(invalidOpen.ok, false);
    const config = { portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } };
    assert.equal((await client.call('serial.open', config)).ok, true);
    await helper('serialscope-virtual-serial-writer', ['COM11']);
    assert.equal((await waitFor((event) => event.method === 'serial.rx' && event.params.hex === '41 42')).params.bytes, 2);
    const reader = helper('serialscope-virtual-serial-reader', ['COM11']);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await client.call('serial.send', { mode: 'hex', data: 'CA FE' })).bytes, 2);
    assert.equal(await reader, 'CA FE');
    const invalidSend = await client.call('serial.send', { mode: 'hex', data: 'GG' });
    assert.equal(invalidSend.ok, false);
    assert.equal((await client.call('serial.close')).ok, true);
    assert.equal((await client.call('serial.status')).isOpen, false);
    assert.equal((await client.call('serial.open', config)).ok, true);
    const state = await client.call('serial.status');
    assert.equal(state.isOpen, true); assert.equal(state.portName, 'COM10');
    await client.call('serial.close');
    assert.ok(notifications.some((event) => event.method === 'serial.tx' && event.params.bytes === 2));
    console.log('Named Pipe 协议生命周期：open/send/rx/tx/close/reopen/错误边界验证通过');
  } finally { client.close(); backend.kill(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
