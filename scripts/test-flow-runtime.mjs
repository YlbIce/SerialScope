import assert from 'node:assert/strict';
import { evaluatePredicate, executeFlowGraph, snapshotForReport } from '../src/renderer-react/src/flow-runtime.mjs';

const nodes = [
  { id: 'start', type: 'input', data: { kind: 'start', label: '开始' } },
  { id: 'write', data: { kind: 'macro', hex: '01 {{address}}', label: '发送' } },
  { id: 'read', data: { kind: 'read', timeoutMs: 20, expected: '01 03', conditionType: 'hex', label: '读取' } },
  { id: 'condition', data: { kind: 'condition', expected: '01 03', conditionType: 'hex', label: '匹配' } },
  { id: 'loop', data: { kind: 'loop', maxIterations: 2, maxDurationMs: 1000, intervalMs: 0, label: '重试' } },
  { id: 'end', type: 'output', data: { kind: 'end', label: '通过' } }
];
const edges = [
  { source: 'start', target: 'write' }, { source: 'write', target: 'read' }, { source: 'read', target: 'condition' },
  { source: 'condition', target: 'end', sourceHandle: 'true' }, { source: 'condition', target: 'loop', sourceHandle: 'false' },
  { source: 'loop', target: 'write', sourceHandle: 'loop' }, { source: 'loop', target: 'end', sourceHandle: 'exit' }
];
const sent = [];
let reads = 0;
const report = await executeFlowGraph({
  nodes, edges, variables: { address: '00' },
  operations: {
    send: async (message) => sent.push(message.data),
    waitForFrame: async () => (++reads === 1 ? { hex: '00 FF' } : { hex: '01 03 02 00 01', text: '' })
  }
});
assert.equal(report.result, 'passed');
assert.deepEqual(sent, ['01 00', '01 00']);
assert.equal(report.variables['loop.iterations'], 1);
assert.equal(evaluatePredicate({ conditionType: 'rule', expected: 'Modbus 读应答' }, { variables: {}, lastFrame: { rules: ['Modbus 读应答'] } }), true);
assert.equal(evaluatePredicate({ conditionType: 'variable', variable: 'temperature', expected: '20', operator: 'greaterThan' }, { variables: { temperature: '21' } }), true);
const modbusFrame = (payload) => {
  let crc = 0xffff;
  for (const byte of payload) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1); }
  return { hex: [...payload, crc & 0xff, crc >>> 8].map((byte) => byte.toString(16).padStart(2, '0')).join(' '), text: '' };
};
const modbus100 = modbusFrame([0x01, 0x03, 0x02, 0x00, 0x64]);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusUnit: 1, modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'uint16be', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: modbus100 }), true);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 1, fieldType: 'uint16be', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: modbus100 }), false);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'uint16be', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: { hex: '01 03 02 00 64 00 00' } }), false);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'uint16be', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: { hex: '01 03 02 00 64' } }), false);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 4, modbusStartAddress: 8, modbusRegisterAddress: 8, fieldType: 'int16be', expected: '-2', operator: 'equals' }, { variables: {}, lastFrame: modbusFrame([0x01, 0x04, 0x02, 0xff, 0xfe]) }), true);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'uint32be', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: modbusFrame([0x01, 0x03, 0x04, 0x00, 0x00, 0x00, 0x64]) }), true);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'float32be', expected: '42.5', operator: 'equals' }, { variables: {}, lastFrame: modbusFrame([0x01, 0x03, 0x04, 0x42, 0x2a, 0x00, 0x00]) }), true);
assert.equal(evaluatePredicate({ conditionType: 'modbusRegister', modbusFunction: 3, modbusStartAddress: 0, modbusRegisterAddress: 0, fieldType: 'unknown', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: modbus100 }), false);
assert.equal(evaluatePredicate({ conditionType: 'byteField', byteOffset: 2, fieldType: 'uint16le', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: { hex: 'AA 10 64 00' } }), true);
assert.equal(evaluatePredicate({ conditionType: 'byteField', byteOffset: -1, fieldType: 'uint16le', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: { hex: 'AA 10 64 00' } }), false);
assert.equal(evaluatePredicate({ conditionType: 'byteField', byteOffset: 3, fieldType: 'uint16le', expected: '100', operator: 'equals' }, { variables: {}, lastFrame: { hex: 'AA 10 64 00' } }), false);
assert.equal(evaluatePredicate({ conditionType: 'textRegex', expected: '^TEMP=(?:[3-9]\\d|100)$' }, { variables: {}, lastFrame: { text: 'TEMP=42' } }), true);
assert.equal(evaluatePredicate({ conditionType: 'textRegex', expected: '[' }, { variables: {}, lastFrame: { text: 'TEMP=42' } }), false);
const assignmentNodes = [{ id: 'start', type: 'input', data: { kind: 'start' } }, { id: 'assign', data: { kind: 'assign', variable: 'request', value: '01 {{address}}' } }, { id: 'write', data: { kind: 'write', data: '{{request}}' } }, { id: 'end', type: 'output', data: { kind: 'end' } }];
const assignmentSent = [];
const assignmentReport = await executeFlowGraph({ nodes: assignmentNodes, edges: [{ source: 'start', target: 'assign' }, { source: 'assign', target: 'write' }, { source: 'write', target: 'end' }], variables: { address: '03' }, operations: { send: async (message) => assignmentSent.push(message.data) } });
assert.equal(assignmentReport.result, 'passed');
assert.deepEqual(assignmentSent, ['01 03']);

const delayedAssertNodes = [
  { id: 'start', type: 'input', data: { kind: 'start' } },
  { id: 'delay', data: { kind: 'delay', durationMs: 1 } },
  { id: 'read', data: { kind: 'read', conditionType: 'text', operator: 'contains', expected: 'READY', timeoutMs: 30 } },
  { id: 'assert', data: { kind: 'assert', conditionType: 'text', operator: 'equals', expected: 'READY', message: '应答文本不正确' } },
  { id: 'end', type: 'output', data: { kind: 'end' } }
];
const delayedAssertReport = await executeFlowGraph({ nodes: delayedAssertNodes, edges: [
  { source: 'start', target: 'delay' }, { source: 'delay', target: 'read' }, { source: 'read', target: 'assert' }, { source: 'assert', target: 'end' }
], operations: { waitForFrame: async () => ({ hex: '52 45 41 44 59', text: 'READY' }) } });
assert.equal(delayedAssertReport.result, 'passed');
assert.deepEqual(delayedAssertReport.steps.map((step) => step.kind), ['start', 'delay', 'read', 'assert', 'end']);
await assert.rejects(
  () => executeFlowGraph({ nodes: [{ id: 'start', type: 'input', data: { kind: 'start' } }, { id: 'assert', data: { kind: 'assert', conditionType: 'variable', variable: 'permit', expected: 'yes', message: '断言已阻断' } }, { id: 'end', type: 'output', data: { kind: 'end' } }], edges: [{ source: 'start', target: 'assert' }, { source: 'assert', target: 'end' }], variables: { permit: 'no' }, operations: {} }),
  (error) => error.report?.result === 'failed' && error.message === '断言已阻断' && !error.report.steps.some((step) => step.nodeId === 'end')
);

const actualMacros = [];
const macroTrackingNodes = [
  { id: 'start', type: 'input', data: { kind: 'start' } },
  { id: 'first', data: { kind: 'macro', data: 'AA', macroSnapshot: { id: 'macro-a', revision: 2, name: '实际执行宏' } } },
  { id: 'condition', data: { kind: 'condition', conditionType: 'variable', variable: 'goSecond', expected: 'yes' } },
  { id: 'second', data: { kind: 'macro', data: 'BB', macroSnapshot: { id: 'macro-b', revision: 1, name: '未执行宏' } } },
  { id: 'end', type: 'output', data: { kind: 'end' } }
];
await executeFlowGraph({ nodes: macroTrackingNodes, edges: [
  { source: 'start', target: 'first' }, { source: 'first', target: 'condition' },
  { source: 'condition', sourceHandle: 'true', target: 'second' }, { source: 'condition', sourceHandle: 'false', target: 'end' },
  { source: 'second', target: 'end' }
], variables: { goSecond: 'no' }, operations: { send: async () => {} }, onMacroExecuted: (macro) => actualMacros.push(macro) });
assert.deepEqual(actualMacros.map((macro) => macro.id), ['macro-a']);

await assert.rejects(
  () => executeFlowGraph({ nodes: nodes.filter((node) => node.id !== 'end'), edges: edges.filter((edge) => edge.target !== 'end'), operations: { send: async () => {}, waitForFrame: async () => ({ hex: '00' }) }, maxSteps: 8 }),
  /缺少 true 出边|缺少 exit 出边|安全步数/
);
const failedEnd = [{ id: 'start', type: 'input', data: { kind: 'start' } }, { id: 'failed', type: 'output', data: { kind: 'end', result: 'failed', message: '条件未满足' } }];
await assert.rejects(
  () => executeFlowGraph({ nodes: failedEnd, edges: [{ source: 'start', target: 'failed' }], operations: {} }),
  (error) => error.report?.result === 'failed' && error.message === '条件未满足'
);
const aborter = new AbortController();
const cancellable = executeFlowGraph({ nodes: [{ id: 'start', type: 'input', data: { kind: 'start' } }, { id: 'delay', data: { kind: 'delay', durationMs: 500 } }, { id: 'end', type: 'output', data: { kind: 'end' } }], edges: [{ source: 'start', target: 'delay' }, { source: 'delay', target: 'end' }], operations: {}, signal: aborter.signal });
setTimeout(() => aborter.abort(), 20);
await assert.rejects(cancellable, (error) => error.report?.result === 'cancelled');
let clock = 0;
const timedNodes = [{ id: 'start', type: 'input', data: { kind: 'start' } }, { id: 'loop', data: { kind: 'loop', maxIterations: 3, maxDurationMs: 1, intervalMs: 1000 } }, { id: 'write', data: { kind: 'macro', hex: 'AA' } }, { id: 'end', type: 'output', data: { kind: 'end' } }];
await assert.rejects(
  () => executeFlowGraph({ nodes: timedNodes, edges: [{ source: 'start', target: 'loop' }, { source: 'loop', sourceHandle: 'loop', target: 'write' }, { source: 'loop', sourceHandle: 'exit', target: 'write' }, { source: 'write', target: 'loop' }, { source: 'write', target: 'end' }], operations: { send: async () => assert.fail('循环耗尽后不得再写串口') }, now: () => clock }),
  (error) => error.report?.result === 'failed' && /停止后续串口写入/.test(error.message)
);
const mutable = { nodes: [{ data: { label: '原始节点' } }], macros: [{ name: '原始宏' }] };
const frozen = snapshotForReport(mutable);
mutable.nodes[0].data.label = '被后续编辑';
mutable.macros[0].name = '被后续编辑';
assert.equal(frozen.nodes[0].data.label, '原始节点');
assert.equal(frozen.macros[0].name, '原始宏');
assert.ok(Object.isFrozen(frozen.nodes[0].data));
console.log('流程执行器：条件、受控循环、变量模板和失败边界验证通过');
