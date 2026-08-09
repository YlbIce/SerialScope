import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { executeFlowGraph } from '../src/renderer-react/src/flow-runtime.mjs';

const require = createRequire(import.meta.url);
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend', 'bin', 'serialscope-backend.exe');
const responder = path.join(root, 'backend', 'build', 'serialscope-virtual-serial-responder.exe');
if (!existsSync(backend) || !existsSync(responder)) throw new Error('未找到后端或虚拟串口应答器；请先运行 npm run build:backend。');

const pipeName = `\\\\.\\pipe\\SerialScope.Workbench.${randomUUID()}`;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const launch = (executable, args) => {
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => child.on('exit', (code) => {
    if (code === 0) resolve(stdout.trim());
    else reject(new Error(`${path.basename(executable)} failed (${code}): ${stderr || stdout}`));
  }));
  return { child, done };
};

const native = launch(backend, ['--pipe', pipeName]);
native.done.catch(() => {}); // 测试收尾主动终止后端，不将其退出视作验收失败。
const client = new NamedPipeRpcClient();
const frames = [];
const waiters = new Set();
client.on('notification', (method, params) => {
  if (method !== 'serial.rx') return;
  const frame = { sequence: Number(params.sequence || 0), hex: params.hex || '', text: params.text || '', timestamp: params.timestamp || Date.now(), rules: params.rules || [] };
  frames.push(frame);
  for (const handler of [...waiters]) handler(frame);
});

async function waitForFrame({ timeoutMs, predicate, signal }) {
  const buffered = frames.find(predicate);
  if (buffered) return buffered;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error(`等待虚拟串口报文超时（${timeoutMs} ms）`)), timeoutMs);
    const onAbort = () => cleanup(new DOMException('流程已取消', 'AbortError'));
    const listener = (frame) => { if (predicate(frame)) cleanup(null, frame); };
    const cleanup = (error, frame) => { clearTimeout(timer); waiters.delete(listener); signal?.removeEventListener('abort', onAbort); error ? reject(error) : resolve(frame); };
    waiters.add(listener); signal?.addEventListener('abort', onAbort, { once: true });
  });
}

try {
  await client.connect(pipeName);
  await client.call('backend.ping');
  await client.call('serial.open', { portName: 'COM11', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } });
  const device = launch(responder, ['COM10', '1']);
  await wait(120);
  const nodes = [
    { id: 'start', type: 'input', data: { kind: 'start' } },
    { id: 'query', data: { kind: 'macro', hex: '01 03 00 00 00 02 C4 0B' } },
    { id: 'read', data: { kind: 'read', timeoutMs: 1500, conditionType: 'hex', expected: '01 03' } },
    { id: 'check', data: { kind: 'condition', conditionType: 'modbusRegister', modbusUnit: 1, modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'uint16be', operator: 'equals', expected: '0' } },
    { id: 'pass', type: 'output', data: { kind: 'end' } }, { id: 'fail', type: 'output', data: { kind: 'end' } }
  ];
  const edges = [
    { source: 'start', target: 'query' }, { source: 'query', target: 'read' }, { source: 'read', target: 'check' },
    { source: 'check', sourceHandle: 'true', target: 'pass' }, { source: 'check', sourceHandle: 'false', target: 'fail' }
  ];
  const report = await executeFlowGraph({ nodes, edges, operations: {
    send: async (message) => { const result = await client.call('serial.send', message); if (!result.ok) throw new Error(result.message || '串口发送失败'); },
    waitForFrame
  } });
  assert.equal(report.result, 'passed');
  assert.equal(report.frames.length, 1);
  assert.ok(report.frames[0].sequence >= 1);
  assert.ok(report.frames[0].hex.replaceAll(' ', '').startsWith('010304'));
  assert.equal(await device.done, '1');
  console.log('设备工作台 COM10/COM11：宏发送、读取等待、Modbus 寄存器条件分支与报告验证通过');
} finally {
  try { await client.call('serial.close'); } catch { /* 后端可能已退出 */ }
  client.close();
  native.child.kill();
}
