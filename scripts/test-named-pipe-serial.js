const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.serial-${process.pid}-${Date.now()}`;
const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');
const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
const client = new NamedPipeRpcClient();
const notifications = [];
client.on('notification', (method, params) => notifications.push({ method, params }));

const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const tick = () => {
    const found = notifications.find(predicate);
    if (found) return resolve(found);
    if (Date.now() - started >= timeout) return reject(new Error('timed out waiting for serial notification'));
    setTimeout(tick, 25);
  };
  tick();
});

function helperPath(name) {
  return path.join(__dirname, '..', 'backend', 'build', `${name}.exe`);
}

function runHelper(name, args) {
  const child = spawn(helperPath(name), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${name} failed (${code}): ${stderr || stdout}`));
    });
  });
}

(async () => {
  try {
    await client.connect(pipeName);
    const listed = await client.call('ports.list');
    if (!listed.ports?.some((port) => port.portName === 'COM10')) throw new Error('COM10 not found in ports.list');
    const opened = await client.call('serial.open', {
      portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' }
    });
    if (!opened.ok) throw new Error(`COM10 open failed: ${opened.message}`);

    const writerOutput = await runHelper('serialscope-virtual-serial-writer', ['COM11']);
    if (writerOutput !== '41 42') throw new Error(`COM11 writer output mismatch: ${writerOutput}`);
    const received = await waitFor((event) => event.method === 'serial.rx' && event.params.hex === '41 42');
    if (received.params.bytes !== 2) throw new Error('serial.rx byte count mismatch');

    const reader = runHelper('serialscope-virtual-serial-reader', ['COM11']);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const sent = await client.call('serial.send', { mode: 'hex', data: 'CA FE' });
    if (!sent.ok || sent.bytes !== 2) throw new Error('serial.send did not report two bytes');
    const readerOutput = await reader;
    if (readerOutput !== 'CA FE') throw new Error(`COM11 read mismatch: ${readerOutput}`);
    await client.call('serial.close');
    console.log('Named Pipe COM10/COM11 serial integration passed');
  } finally {
    client.close();
    backend.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
