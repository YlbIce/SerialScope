import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, addEdge, useEdgesState, useNodesState } from '@xyflow/react';
import { executeFlowGraph, FlowExecutionError, normalizeHex, snapshotForReport } from './flow-runtime.mjs';
import { appendChecksum, checksumAlgorithms } from './checksums.mjs';

const api = window.serialScope;
const flowStorageKey = 'serialscope.device-workbench.flow.v2';
const flowVersionsStorageKey = 'serialscope.device-workbench.flow-versions.v1';
const macroStorageKey = 'serialscope.device-workbench.macros.v1';
const mainMacroStorageKey = 'serialscope.macros';
const reportStorageKey = 'serialscope.device-workbench.reports.v1';
const ruleStorageKey = 'serialscope.device-workbench.rules.v1';

const builtInMacros = [{ id: 'builtin-read-registers', name: '读取寄存器', kind: 'query', mode: 'hex', data: '01 03 00 00 00 02 C4 0B', lineEnding: 'none', revision: 1, updatedAt: 0 }];

const defaultNodes = [
  { id: 'start', type: 'flow', position: { x: 40, y: 180 }, data: { label: '开始', kind: 'start' } },
  { id: 'query', type: 'flow', position: { x: 260, y: 180 }, data: { label: '宏：读取寄存器', kind: 'macro', macroId: 'builtin-read-registers', macroName: '读取寄存器' } },
  { id: 'read', type: 'flow', position: { x: 520, y: 180 }, data: { label: '读取：等待应答', kind: 'read', timeoutMs: 500, conditionType: 'hex', expected: '01 03' } },
  { id: 'condition', type: 'flow', position: { x: 780, y: 180 }, data: { label: '条件：HEX 匹配', kind: 'condition', conditionType: 'hex', operator: 'startsWith', expected: '01 03' } },
  { id: 'end', type: 'flow', position: { x: 1040, y: 150 }, data: { label: '通过', kind: 'end', result: 'passed' } },
  { id: 'failed', type: 'flow', position: { x: 1040, y: 300 }, data: { label: '未匹配', kind: 'end', result: 'failed', message: '应答未满足条件' } }
];
const defaultEdges = [
  { id: 'e-start-query', source: 'start', sourceHandle: 'next', target: 'query' }, { id: 'e-query-read', source: 'query', sourceHandle: 'next', target: 'read' },
  { id: 'e-read-condition', source: 'read', sourceHandle: 'next', target: 'condition' }, { id: 'e-condition-end', source: 'condition', sourceHandle: 'true', target: 'end', label: '满足' },
  { id: 'e-condition-failed', source: 'condition', sourceHandle: 'false', target: 'failed', label: '不满足' }
];

function parseStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function migrateFlow(value) {
  if (!Array.isArray(value?.nodes) || !Array.isArray(value?.edges)) return { nodes: defaultNodes, edges: defaultEdges };
  return { ...value, nodes: value.nodes.map((node) => {
    if (node.data?.kind !== 'macro' || node.data.macroId) return node;
    // 旧版把 payload 内联在“宏”节点。迁移为明确的写入节点，不能冒充宏库引用。
    return { ...node, data: { ...node.data, kind: 'write', label: node.data.label?.replace(/^宏：/, '写入：') || '写入：兼容迁移', data: node.data.data ?? node.data.hex ?? '', mode: node.data.mode || 'hex' } };
  }) };
}
function loadFlow() { return migrateFlow(parseStorage(flowStorageKey, null)); }
function time(value = Date.now()) { const d = new Date(value); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`; }
function normalizeRules(value) { return Array.isArray(value) ? value.filter((rule) => rule?.name && rule?.pattern).map((rule) => ({ id: rule.id || rule.name, name: String(rule.name), pattern: String(rule.pattern), enabled: rule.enabled !== false })) : []; }
function matchedRuleNames(frame, rules) {
  const source = `${frame.hex || ''}\n${frame.text || ''}`;
  return rules.flatMap((rule) => {
    if (!rule.enabled) return [];
    try { return new RegExp(rule.pattern, 'i').test(source) ? [rule.name] : []; } catch { return []; }
  });
}
function newId(prefix) { return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function normalizeMacros(value) {
  const stored = Array.isArray(value) ? value.filter((macro) => macro?.name).map((macro) => ({
    id: macro.id || newId('macro'), name: String(macro.name), kind: macro.kind === 'write' ? 'write' : 'query', mode: macro.mode === 'text' ? 'text' : 'hex',
    data: String(macro.data ?? macro.hex ?? ''), lineEnding: macro.lineEnding || 'none', revision: Math.max(1, Number(macro.revision || 1)), updatedAt: Number(macro.updatedAt || Date.now())
  })) : [];
  const byId = new Map(builtInMacros.map((macro) => [macro.id, macro]));
  for (const macro of stored) byId.set(macro.id, macro);
  return [...byId.values()];
}
function normalizeMainMacros(value) {
  return Array.isArray(value) ? value.filter((macro) => macro?.name && macro?.data != null).map((macro) => ({
    id: `legacy-${encodeURIComponent(String(macro.name))}`,
    name: String(macro.name),
    kind: macro.kind === 'write' ? 'write' : 'query',
    mode: macro.mode === 'text' ? 'text' : 'hex',
    data: String(macro.data),
    lineEnding: macro.lineEnding || 'none',
    appendModbusCrc: Boolean(macro.appendModbusCrc),
    revision: Math.max(1, Number(macro.revision || 1)),
    updatedAt: Number(macro.updatedAt || 0),
    source: 'main'
  })) : [];
}
function availableMacros(workbenchMacros, mainMacros) {
  const byId = new Map(mainMacros.map((macro) => [macro.id, macro]));
  for (const macro of workbenchMacros) byId.set(macro.id, macro);
  return [...byId.values()];
}

function FlowNode({ data, selected }) {
  const branch = data.kind === 'condition';
  const loop = data.kind === 'loop';
  const canOutput = data.kind !== 'end';
  return <div className={`flow-node ${selected ? 'selected' : ''} ${data.runtimeState || ''}`}>
    {data.kind !== 'start' && <Handle type="target" position={Position.Left} />}
    <strong>{data.label}</strong><small>{data.kind}</small>
    {canOutput && !branch && !loop && <Handle type="source" position={Position.Right} id="next" />}
    {branch && <><Handle type="source" position={Position.Right} id="true" style={{ top: '32%' }} /><Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} /><span className="handle-label true">是</span><span className="handle-label false">否</span></>}
    {loop && <><Handle type="source" position={Position.Right} id="loop" /><span className="handle-label true">重试</span></>}
  </div>;
}

const nodeTypes = { flow: FlowNode };
const labels = { macro: '宏：查询/写入', write: '写入：发送报文', read: '读取：等待报文', condition: '条件：报文/变量', loop: '循环：受限重试', delay: '延迟：100 ms', assign: '变量赋值', assert: '断言：检查条件', end: '结束' };

function PredicateEditor({ data, onChange }) {
  const type = data.conditionType || 'hex';
  const changeType = (nextType) => {
    const names = { hex: 'HEX 整帧', text: '文本', textRegex: '文本正则', rule: '规则命中', variable: '变量', modbusRegister: 'Modbus 寄存器', byteField: '字节字段' };
    const defaultConditionLabels = new Set(['条件：HEX 匹配', ...Object.values(names).map((name) => `条件：${name}`)]);
    const defaultAssertLabels = new Set(['断言：检查条件', ...Object.values(names).map((name) => `断言：${name}`)]);
    onChange('conditionType', nextType);
    if (['modbusRegister', 'byteField'].includes(nextType) && ['startsWith', 'contains', 'notEmpty'].includes(data.operator || '')) onChange('operator', 'equals');
    if (data.kind === 'condition' && (!data.label || defaultConditionLabels.has(data.label))) onChange('label', `条件：${names[nextType]}`);
    if (data.kind === 'assert' && (!data.label || defaultAssertLabels.has(data.label))) onChange('label', `断言：${names[nextType]}`);
  };
  const numeric = type === 'modbusRegister' || type === 'byteField';
  const expectedLabel = numeric ? '期望数值' : (type === 'textRegex' ? '正则表达式' : '期望值');
  const fieldTypes = [['uint8', '无符号 8 位'], ['int8', '有符号 8 位'], ['uint16be', '无符号 16 位（大端）'], ['uint16le', '无符号 16 位（小端）'], ['int16be', '有符号 16 位（大端）'], ['int16le', '有符号 16 位（小端）'], ['uint32be', '无符号 32 位（大端）'], ['uint32le', '无符号 32 位（小端）'], ['int32be', '有符号 32 位（大端）'], ['int32le', '有符号 32 位（小端）'], ['float32be', '浮点数（大端）'], ['float32le', '浮点数（小端）']];
  const comparison = <label>比较<select value={data.operator || (type === 'hex' ? 'startsWith' : 'equals')} onChange={(event) => onChange('operator', event.target.value)}><option value="startsWith">开头匹配</option><option value="contains">包含</option><option value="equals">完全相等</option><option value="notEmpty">非空</option><option value="greaterThan">大于</option><option value="lessThan">小于</option></select></label>;
  return <>
    <label>条件类型<select value={type} onChange={(event) => changeType(event.target.value)}><option value="hex">HEX 整帧</option><option value="text">文本</option><option value="textRegex">文本正则</option><option value="rule">规则命中</option><option value="variable">变量</option><option value="modbusRegister">Modbus 寄存器</option><option value="byteField">字节字段（通用二进制）</option></select></label>
    {type === 'modbusRegister' && <><label>从站地址（可选）<input type="number" placeholder="不限制" value={data.modbusUnit ?? ''} onChange={(event) => onChange('modbusUnit', event.target.value === '' ? '' : Number(event.target.value))} /></label><label>功能码<select value={data.modbusFunction || 3} onChange={(event) => onChange('modbusFunction', Number(event.target.value))}><option value={3}>03 读保持寄存器</option><option value={4}>04 读输入寄存器</option></select></label><label>读取起始地址<input type="number" min="0" value={data.modbusStartAddress ?? 0} onChange={(event) => onChange('modbusStartAddress', Number(event.target.value))} /></label><label>目标寄存器地址<input type="number" min="0" value={data.modbusRegisterAddress ?? data.modbusStartAddress ?? 0} onChange={(event) => onChange('modbusRegisterAddress', Number(event.target.value))} /></label><label>寄存器数据类型<select value={data.fieldType || 'uint16be'} onChange={(event) => onChange('fieldType', event.target.value)}>{fieldTypes.slice(2).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><small>示例：03 从地址 0 读取后，目标地址 0、无符号 16 位大端、等于 100。</small></>}
    {type === 'byteField' && <><label>帧字节偏移（从 0 开始）<input type="number" min="0" value={data.byteOffset ?? 0} onChange={(event) => onChange('byteOffset', Number(event.target.value))} /></label><label>字段数据类型<select value={data.fieldType || 'uint8'} onChange={(event) => onChange('fieldType', event.target.value)}>{fieldTypes.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><small>适用于任意二进制协议；偏移基于原始 RX 帧，包含协议头。</small></>}
    <label>{expectedLabel}<input value={data.expected || ''} onChange={(event) => onChange('expected', event.target.value)} /></label>
    {type === 'textRegex' ? <label>正则标志（可选）<input placeholder="例如 i" value={data.regexFlags || ''} onChange={(event) => onChange('regexFlags', event.target.value)} /></label> : comparison}
    {type === 'variable' && <label>变量名<input value={data.variable || ''} onChange={(event) => onChange('variable', event.target.value)} /></label>}
  </>;
}

export function App() {
  const initial = useMemo(loadFlow, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [flowVersion, setFlowVersion] = useState(() => Number(initial.revision || 1));
  const [selectedId, setSelectedId] = useState('query');
  const [backend, setBackend] = useState('连接中');
  const [serial, setSerial] = useState({ isOpen: false, portName: '' });
  const [logs, setLogs] = useState([]);
  const [run, setRun] = useState({ state: 'idle', node: '', detail: '尚未执行' });
  const [runTarget, setRunTarget] = useState('simulation');
  const [hardwareApproved, setHardwareApproved] = useState(false);
  const [report, setReport] = useState(null);
  const [reports, setReports] = useState(() => parseStorage(reportStorageKey, []));
  const [macros, setMacros] = useState(() => normalizeMacros(parseStorage(macroStorageKey, [])));
  const [mainMacros, setMainMacros] = useState(() => normalizeMainMacros(parseStorage(mainMacroStorageKey, [])));
  const [macroDraft, setMacroDraft] = useState({ name: '读取寄存器', kind: 'query', mode: 'hex', data: '01 03 00 00 00 02 C4 0B', lineEnding: 'none', checksumAlgorithm: 'crc16-modbus' });
  const [rules, setRules] = useState(() => normalizeRules(parseStorage(ruleStorageKey, [])));
  const [ruleDraft, setRuleDraft] = useState({ name: 'Modbus 读应答', pattern: '^01\\s*03' });
  const [flowVersions, setFlowVersions] = useState(() => parseStorage(flowVersionsStorageKey, []));
  const waiters = useRef(new Set());
  const controller = useRef(null);
  const rulesRef = useRef(rules);

  useEffect(() => {
    const report = (name, details) => api.reportDiagnostic?.(name, details).catch(() => {});
    const onError = (event) => report('uncaught-error', { message: event.message, filename: event.filename, line: event.lineno, column: event.colno });
    const onRejection = (event) => report('unhandled-rejection', { message: String(event.reason?.message || event.reason || 'unknown') });
    window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);

  const publishFrame = useCallback((frame) => {
    for (const resolve of [...waiters.current]) resolve(frame);
  }, []);

  const waitForFrame = useCallback(({ timeoutMs, predicate, signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error(`等待报文超时（${timeoutMs} ms）`)), timeoutMs);
    const onAbort = () => cleanup(new DOMException('流程已由用户取消', 'AbortError'));
    const listener = (frame) => { if (predicate(frame)) cleanup(null, frame); };
    const cleanup = (error, value) => {
      clearTimeout(timer); waiters.current.delete(listener); signal?.removeEventListener('abort', onAbort);
      error ? reject(error) : resolve(value);
    };
    waiters.current.add(listener);
    signal?.addEventListener('abort', onAbort, { once: true });
  }), []);

  useEffect(() => {
    let alive = true;
    api.startBackend().then(() => api.callBackend('serial.status', {})).then((state) => {
      if (alive) { setBackend('后端已连接'); setSerial(state); }
    }).catch((error) => alive && setBackend(`后端错误：${error.message}`));
    const unlisten = api.onBackendRpcNotification(({ method, params }) => {
      if (method === 'serial.state') setSerial(params);
      if (method === 'serial.rx' || method === 'serial.tx') {
        const baseFrame = { sequence: Number(params.sequence || 0), timestamp: params.timestamp || Date.now(), hex: params.hex || '', text: params.text || '', direction: method.endsWith('rx') ? 'rx' : 'tx' };
        const frame = { ...baseFrame, rules: matchedRuleNames(baseFrame, rulesRef.current) };
        setLogs((items) => [...items.slice(-499), frame]);
        if (frame.direction === 'rx') publishFrame(frame);
      }
    });
    return () => { alive = false; unlisten?.(); };
  }, [publishFrame]);

  useEffect(() => api.onSimulatorInstanceStatus?.((status) => {
    const state = status.state === 'ready' ? 'ready' : (status.state === 'stopped' ? 'idle' : (status.state === 'starting' ? 'waiting' : 'failed'));
    setRun({ state, node: 'simulator', detail: status.message || (state === 'ready' ? '模拟下位机已就绪' : (state === 'waiting' ? '正在启动模拟下位机' : '模拟下位机启动失败')) });
  }), []);

  useEffect(() => localStorage.setItem(flowStorageKey, JSON.stringify({ version: 2, revision: flowVersion, nodes, edges })), [nodes, edges, flowVersion]);
  useEffect(() => localStorage.setItem(macroStorageKey, JSON.stringify(macros)), [macros]);
  useEffect(() => { rulesRef.current = rules; localStorage.setItem(ruleStorageKey, JSON.stringify(rules)); }, [rules]);
  useEffect(() => {
    const refreshMainMacros = () => setMainMacros(normalizeMainMacros(parseStorage(mainMacroStorageKey, [])));
    window.addEventListener('storage', refreshMainMacros);
    return () => window.removeEventListener('storage', refreshMainMacros);
  }, []);

  const selected = nodes.find((node) => node.id === selectedId);
  const macroOptions = useMemo(() => availableMacros(macros, mainMacros), [macros, mainMacros]);
  const updateSelected = (field, value) => setNodes((items) => items.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, [field]: value } } : node));
  const addNode = (kind, data = {}) => {
    const id = `${kind}-${Date.now()}`;
    const selectedMacro = macroOptions[0] || builtInMacros[0];
    const defaults = { macro: { macroId: selectedMacro.id, macroName: selectedMacro.name, mode: selectedMacro.mode, data: selectedMacro.data }, write: { mode: macroDraft.mode, data: macroDraft.data }, read: { timeoutMs: 500, conditionType: 'hex', expected: '' }, condition: { conditionType: 'hex', operator: 'startsWith', expected: '' }, loop: { maxIterations: 3, maxDurationMs: 10000, intervalMs: 100 }, delay: { durationMs: 100 }, assign: { variable: 'value', value: '' }, assert: { conditionType: 'hex', operator: 'startsWith', expected: '', message: '断言不满足' }, end: { result: 'passed' } };
    setNodes((items) => [...items, { id, type: 'flow', position: { x: 280 + (items.length % 4) * 230, y: 430 + Math.floor(items.length / 4) * 110 }, data: { label: labels[kind], kind, ...defaults[kind], ...data } }]);
    setSelectedId(id);
  };

  const saveMacro = () => {
    const validData = macroDraft.mode === 'hex' ? normalizeHex(macroDraft.data) : macroDraft.data.trim();
    if (!macroDraft.name.trim() || !validData) return setRun({ state: 'failed', node: 'macro-library', detail: '宏名称和报文不能为空' });
    setMacros((items) => {
      const existing = items.find((item) => item.name === macroDraft.name);
      const next = { ...macroDraft, id: existing?.id || newId('macro'), data: macroDraft.data, revision: (existing?.revision || 0) + 1, updatedAt: Date.now() };
      return [...items.filter((item) => item.id !== next.id), next];
    });
  };
  const appendMacroChecksum = () => {
    if (macroDraft.mode !== 'hex') return setRun({ state: 'failed', node: 'macro-library', detail: 'CRC 仅支持 HEX 宏' });
    const data = appendChecksum(macroDraft.data, macroDraft.checksumAlgorithm);
    if (!data) return setRun({ state: 'failed', node: 'macro-library', detail: 'HEX 报文无效，无法计算校验' });
    setMacroDraft({ ...macroDraft, data });
    setRun({ state: 'idle', node: 'macro-library', detail: `已追加 ${checksumAlgorithms.find((item) => item.id === macroDraft.checksumAlgorithm)?.label || 'CRC'}；请保存宏` });
  };
  const saveRule = () => {
    try { new RegExp(ruleDraft.pattern, 'i'); } catch { return setRun({ state: 'failed', node: 'rule-library', detail: '规则表达式无效' }); }
    if (!ruleDraft.name.trim() || !ruleDraft.pattern.trim()) return setRun({ state: 'failed', node: 'rule-library', detail: '规则名称和表达式不能为空' });
    setRules((items) => [...items.filter((item) => item.name !== ruleDraft.name), { id: ruleDraft.name, name: ruleDraft.name, pattern: ruleDraft.pattern, enabled: true }]);
  };
  const saveReport = (value, usedMacros = macros) => {
    const snapshot = snapshotForReport({ ...value, flowSnapshot: { revision: flowVersion, nodes, edges }, macroSnapshot: usedMacros });
    setReport(snapshot);
    const reports = [snapshot, ...parseStorage(reportStorageKey, []).slice(0, 19)];
    localStorage.setItem(reportStorageKey, JSON.stringify(reports));
    setReports(reports);
    return snapshot;
  };
  const saveFlowVersion = () => {
    const revision = flowVersion + 1;
    const snapshot = { id: newId('flow'), revision, savedAt: Date.now(), nodes: structuredClone(nodes), edges: structuredClone(edges) };
    setFlowVersions((items) => { const next = [snapshot, ...items].slice(0, 20); localStorage.setItem(flowVersionsStorageKey, JSON.stringify(next)); return next; });
    setFlowVersion(revision);
  };
  const loadFlowVersion = (id) => {
    const snapshot = flowVersions.find((item) => item.id === id);
    if (!snapshot) return;
    setNodes(structuredClone(snapshot.nodes)); setEdges(structuredClone(snapshot.edges)); setFlowVersion(snapshot.revision); setRun({ state: 'replay', node: '', detail: `已载入用例版本 v${snapshot.revision}` });
  };
  const replayReport = (item) => {
    if (!item?.flowSnapshot) return;
    setNodes(structuredClone(item.flowSnapshot.nodes)); setEdges(structuredClone(item.flowSnapshot.edges)); setFlowVersion(item.flowSnapshot.revision);
    setMacros((current) => {
      const byId = new Map(normalizeMacros(current).map((macro) => [macro.id, macro]));
      for (const macro of normalizeMacros(item.macroSnapshot || [])) byId.set(macro.id, macro);
      return [...byId.values()];
    });
    setReport(item); setRun({ state: 'replay', node: '', detail: `已载入报告中的用例 v${item.flowSnapshot.revision}，可重新执行` });
  };
  const markRuntime = (nodeId, state, outcome) => {
    setNodes((items) => items.map((node) => ({ ...node, data: { ...node.data, runtimeState: node.id === nodeId ? state : node.data.runtimeState === 'running' || node.data.runtimeState === 'waiting' ? '' : node.data.runtimeState } })));
    if (outcome) setEdges((items) => items.map((edge) => edge.source === nodeId && (edge.sourceHandle === outcome || edge.data?.outcome === outcome || (!edge.sourceHandle && outcome === 'next')) ? { ...edge, animated: true, style: { stroke: '#39c98f', strokeWidth: 3 } } : edge));
  };
  const execute = async () => {
    if (controller.current) return;
    if (runTarget === 'hardware' && !hardwareApproved) {
      setRun({ state: 'blocked', node: '', detail: '真实设备执行需要用户确认已取得设备、连接参数和安全报文授权' });
      return;
    }
    let permissionGranted = false;
    try {
      await api.beginWorkbenchExecution({ target: runTarget });
      permissionGranted = true;
    } catch (error) {
      setRun({ state: 'blocked', node: '', detail: error.message });
      return;
    }
    const execution = new AbortController(); controller.current = execution;
    setNodes((items) => items.map((node) => ({ ...node, data: { ...node.data, runtimeState: '' } })));
    setEdges((items) => items.map((edge) => ({ ...edge, animated: false, style: undefined })));
    const usedMacros = [];
    try {
      const macrosById = new Map(macroOptions.map((macro) => [macro.id, macro]));
      const executionNodes = nodes.map((node) => {
        if (node.data?.kind !== 'macro') return node;
        if (!node.data.macroId) throw new Error(`宏节点“${node.data.label || node.id}”必须引用宏库项；请改为“写入”节点或选择宏库`);
        const macro = macrosById.get(node.data.macroId);
        if (!macro) throw new Error(`宏节点“${node.data.label || node.id}”引用的宏已不存在`);
        return { ...node, data: { ...node.data, macroName: macro.name, mode: macro.mode, data: macro.data, lineEnding: macro.lineEnding, appendModbusCrc: Boolean(macro.appendModbusCrc), macroSnapshot: snapshotForReport(macro) } };
      });
      const result = await executeFlowGraph({ nodes: executionNodes, edges, signal: execution.signal, variables: {}, operations: {
        send: async (message) => { const value = await api.callBackend('serial.send', message); if (!value.ok) throw new Error(value.message || '串口发送失败'); },
        waitForFrame
      }, onStatus: (event) => { setRun({ state: event.state, node: event.nodeId, detail: event.detail }); markRuntime(event.nodeId, event.state, event.outcome); }, onMacroExecuted: (macro) => {
        if (!usedMacros.some((item) => item.id === macro.id && item.revision === macro.revision)) usedMacros.push(macro);
      } });
      saveReport(result, usedMacros); setRun({ state: 'passed', node: 'end', detail: `流程通过，用时 ${result.durationMs} ms` });
    } catch (error) {
      const result = error instanceof FlowExecutionError ? error.report : { result: 'failed', error: { message: error.message } };
      saveReport(result, usedMacros); setRun({ state: result.result || 'failed', node: result.steps?.at(-1)?.nodeId || '', detail: error.message });
    } finally {
      controller.current = null;
      if (permissionGranted) await api.endWorkbenchExecution().catch(() => {});
    }
  };
  const exportReport = async (format = 'json') => {
    if (!report) return;
    const stamp = Date.now();
    if (format === 'csv') {
      const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const rows = [['type', 'sequence', 'node', 'kind', 'status', 'durationMs', 'outcome', 'hex', 'error'],
        ...report.steps.map((step) => ['step', '', step.nodeId, step.kind, step.status, step.durationMs, step.outcome || '', '', step.error || '']),
        ...report.frames.map((frame) => ['frame', frame.sequence || '', '', '', '', '', '', frame.hex || '', ''])];
      await api.saveTextFile({ title: '导出流程执行报告 CSV', defaultPath: `serialscope-flow-${stamp}.csv`, content: rows.map((row) => row.map(cell).join(',')).join('\n'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
      return;
    }
    if (format === 'html') {
      const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const steps = report.steps.map((step) => `<tr><td>${escape(step.nodeId)}</td><td>${escape(step.kind)}</td><td>${escape(step.status)}</td><td>${escape(step.durationMs)}</td><td>${escape(step.outcome)}</td><td>${escape(step.error)}</td></tr>`).join('');
      const frames = report.frames.map((frame) => `<li>#${escape(frame.sequence || '?')} ${escape(frame.hex)}</li>`).join('');
      const html = `<!doctype html><meta charset="utf-8"><title>SerialScope 流程报告</title><style>body{font-family:Segoe UI,Microsoft YaHei;margin:2rem}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.35rem}code{white-space:pre-wrap}</style><h1>SerialScope 流程报告</h1><p>结果：<b>${escape(report.result)}</b>；耗时：${escape(report.durationMs)} ms</p><p>${escape(report.error?.message || '')}</p><h2>步骤</h2><table><tr><th>节点</th><th>类型</th><th>状态</th><th>耗时 ms</th><th>分支</th><th>原因</th></tr>${steps}</table><h2>消费帧</h2><ul>${frames}</ul><h2>复现快照</h2><code>${escape(JSON.stringify({ flowSnapshot: report.flowSnapshot, macroSnapshot: report.macroSnapshot }, null, 2))}</code>`;
      await api.saveTextFile({ title: '导出流程执行报告 HTML', defaultPath: `serialscope-flow-${stamp}.html`, content: html, filters: [{ name: 'HTML', extensions: ['html'] }] });
      return;
    }
    await api.saveTextFile({ title: '导出流程执行报告', defaultPath: `serialscope-flow-${stamp}.json`, content: JSON.stringify(report, null, 2), filters: [{ name: 'JSON', extensions: ['json'] }] });
  };
  const configureSimulator = async () => {
    const config = { enabled: true, builtIn: 'modbus', delayMs: 20, rules: [{ enabled: true, matchHex: '01 03 00 00 00 02 C4 0B', responseHex: '01 03 04 00 00 00 00 FA 33' }], serial: { portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } } };
    localStorage.setItem('serialscope.simulator', JSON.stringify(config));
    const result = await api.launchSimulatorInstance(config);
    setRun({ state: 'waiting', node: 'simulator', detail: result.message || '正在等待第二个模拟实例确认 COM10 已就绪' });
  };

  return <div className="app workbench-only">
    <main><header><div><small>React Flow · 可执行通信用例</small><h2>通信测试工作台</h2></div><div className={serial.isOpen ? 'pill online' : 'pill'}>{serial.isOpen ? `${serial.portName} 已打开` : '串口未打开'}</div></header><section className="run-mode"><b>执行目标</b><label><input type="radio" checked={runTarget === 'simulation'} onChange={() => setRunTarget('simulation')} /> 模拟下位机回归</label><label><input type="radio" checked={runTarget === 'hardware'} onChange={() => setRunTarget('hardware')} /> 真实设备</label>{runTarget === 'hardware' && <label><input type="checkbox" checked={hardwareApproved} onChange={(event) => setHardwareApproved(event.target.checked)} /> 已取得设备、参数与安全报文授权</label>}<button onClick={() => configureSimulator().catch((error) => setRun({ state: 'failed', node: 'simulator', detail: error.message }))}>启动第二个模拟实例</button></section>
      <section className="workbench"><aside className="palette"><b>节点与宏库</b>{['macro', 'write', 'read', 'condition', 'loop', 'delay', 'assign', 'assert', 'end'].map((kind) => <button key={kind} onClick={() => addNode(kind)}>+ {labels[kind]}</button>)}<hr/><label>宏名称<input value={macroDraft.name} onChange={(event) => setMacroDraft({ ...macroDraft, name: event.target.value })} /></label><label>类别<select value={macroDraft.kind} onChange={(event) => setMacroDraft({ ...macroDraft, kind: event.target.value })}><option value="query">查询</option><option value="write">写入</option></select></label><label>模式<select value={macroDraft.mode} onChange={(event) => setMacroDraft({ ...macroDraft, mode: event.target.value })}><option value="hex">HEX</option><option value="text">文本</option></select></label><label>报文<input value={macroDraft.data} onChange={(event) => setMacroDraft({ ...macroDraft, data: event.target.value })} /></label>{macroDraft.mode === 'hex' && <><label>CRC 计算<select value={macroDraft.checksumAlgorithm} onChange={(event) => setMacroDraft({ ...macroDraft, checksumAlgorithm: event.target.value })}>{checksumAlgorithms.map((algorithm) => <option key={algorithm.id} value={algorithm.id}>{algorithm.label}</option>)}</select></label><button onClick={appendMacroChecksum}>计算并追加校验</button></>}{macroDraft.mode === 'text' && <label>行尾<select value={macroDraft.lineEnding} onChange={(event) => setMacroDraft({ ...macroDraft, lineEnding: event.target.value })}><option value="none">无</option><option value="CRLF">CRLF</option><option value="LF">LF</option></select></label>}<button onClick={saveMacro}>保存宏</button><small>主界面宏库与工作台宏库均可直接加入流程。</small>{macroOptions.map((macro) => <button className="macro-item" key={macro.id} onClick={() => addNode('macro', { label: `宏：${macro.name}`, macroId: macro.id, macroName: macro.name, mode: macro.mode, data: macro.data, lineEnding: macro.lineEnding })}>{macro.source === 'main' ? '主' : (macro.kind === 'write' ? '写' : '查')} · {macro.name} · v{macro.revision}</button>)}<hr/><b>规则库（供“规则命中”条件使用）</b><label>规则名称<input value={ruleDraft.name} onChange={(event) => setRuleDraft({ ...ruleDraft, name: event.target.value })} /></label><label>正则表达式<input value={ruleDraft.pattern} onChange={(event) => setRuleDraft({ ...ruleDraft, pattern: event.target.value })} /></label><button onClick={saveRule}>保存规则</button>{rules.map((rule) => <small key={rule.id}>{rule.name}：{rule.pattern}</small>)}</aside>
        <div className="canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_event, node) => setSelectedId(node.id)} onConnect={(connection) => setEdges((items) => addEdge({ ...connection, id: `e-${Date.now()}` }, items))} fitView><Background /><Controls /><MiniMap /></ReactFlow></div>
        <aside className="inspector">
          <b>节点配置</b>
          {selected ? <>
            <small>{selected.data.kind} · {selected.id}</small>
            <label>名称<input value={selected.data.label || ''} onChange={(event) => updateSelected('label', event.target.value)} /></label>
            {selected.data.kind === 'macro' && <><label>引用宏库<select value={selected.data.macroId || ''} onChange={(event) => { const macro = macroOptions.find((item) => item.id === event.target.value); if (macro) setNodes((items) => items.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, macroId: macro.id, macroName: macro.name, mode: macro.mode, data: macro.data, lineEnding: macro.lineEnding, appendModbusCrc: macro.appendModbusCrc } } : node)); }} >{macroOptions.map((macro) => <option key={macro.id} value={macro.id}>{macro.source === 'main' ? '主界面' : (macro.kind === 'write' ? '写' : '查')} · {macro.name} · v{macro.revision}</option>)}</select></label><small>可直接选择主界面既有宏；执行时固定取所选宏的版本快照。</small></>}
            {selected.data.kind === 'write' && <><label>模式<select value={selected.data.mode || 'hex'} onChange={(event) => updateSelected('mode', event.target.value)}><option value="hex">HEX</option><option value="text">文本</option></select></label><label>报文<input value={selected.data.data ?? selected.data.hex ?? ''} onChange={(event) => updateSelected('data', event.target.value)} /></label></>}
            {['read', 'condition', 'assert'].includes(selected.data.kind) && <PredicateEditor data={selected.data} onChange={updateSelected} />}
            {selected.data.kind === 'read' && <label>等待超时 ms<input type="number" value={selected.data.timeoutMs || 500} onChange={(event) => updateSelected('timeoutMs', Number(event.target.value))} /></label>}
            {selected.data.kind === 'delay' && <label>延迟 ms<input type="number" value={selected.data.durationMs || 100} onChange={(event) => updateSelected('durationMs', Number(event.target.value))} /></label>}
            {selected.data.kind === 'loop' && <><label>最大次数<input type="number" value={selected.data.maxIterations || 3} onChange={(event) => updateSelected('maxIterations', Number(event.target.value))} /></label><label>最大时长 ms<input type="number" value={selected.data.maxDurationMs || 10000} onChange={(event) => updateSelected('maxDurationMs', Number(event.target.value))} /></label><label>间隔 ms<input type="number" value={selected.data.intervalMs || 100} onChange={(event) => updateSelected('intervalMs', Number(event.target.value))} /></label><small>到达任一边界即失败，后续写入被阻断。</small></>}
            {selected.data.kind === 'assign' && <><label>变量名<input value={selected.data.variable || ''} onChange={(event) => updateSelected('variable', event.target.value)} /></label><label>值<input value={selected.data.value || ''} onChange={(event) => updateSelected('value', event.target.value)} /></label></>}
            <button onClick={() => setNodes((items) => items.filter((node) => node.id !== selectedId))}>删除节点</button>
          </> : <small>点击画布节点进行编辑</small>}
          <hr/>
          <button className="primary" onClick={execute} disabled={run.state === 'running' || run.state === 'waiting'}>{run.state === 'running' || run.state === 'waiting' ? '执行中' : '执行流程'}</button>
          <button onClick={() => controller.current?.abort()} disabled={!controller.current}>取消执行</button>
          <button onClick={() => exportReport('json')} disabled={!report}>导出 JSON</button><button onClick={() => exportReport('csv')} disabled={!report}>导出 CSV</button><button onClick={() => exportReport('html')} disabled={!report}>导出 HTML</button>
          <p className={`run ${run.state}`}>{run.state} · {run.node} · {run.detail}</p>
        </aside>
      </section><section className="execution-log"><b>用例版本 v{flowVersion}</b><button className="inline-button" onClick={saveFlowVersion}>保存为新版本</button>{flowVersions.length > 0 && <label>已保存版本<select defaultValue="" onChange={(event) => event.target.value && loadFlowVersion(event.target.value)}><option value="">选择载入…</option>{flowVersions.map((item) => <option key={item.id} value={item.id}>v{item.revision} · {time(item.savedAt)}</option>)}</select></label>}<b>近期报文</b>{logs.slice(-8).map((item, index) => <div key={`${item.timestamp}-${index}`}><small>#{item.sequence || '?'} {time(item.timestamp)}</small> <strong>{item.direction.toUpperCase()}</strong> {item.hex}{item.rules?.length ? ` · 规则：${item.rules.join(', ')}` : ''}</div>)}{reports.slice(0, 5).map((item, index) => <button className="inline-button" key={`${item.startedAt}-${index}`} onClick={() => replayReport(item)}>重放报告 #{index + 1} · {item.result} · {item.durationMs} ms</button>)}</section>{report && <section className="report-panel"><b>执行报告：{report.result} · {report.durationMs} ms</b>{report.error?.message && <p className="report-error">失败节点：{report.steps?.at(-1)?.nodeId || '未知'}；{report.error.message}</p>}<div><strong>步骤时序</strong>{report.steps.map((step, index) => <p key={`${step.nodeId}-${index}`}>#{index + 1} {step.label} / {step.kind}：{step.status} · {step.durationMs} ms{step.outcome ? ` · 分支 ${step.outcome}` : ''}{step.error ? ` · ${step.error}` : ''}</p>)}</div><div><strong>消费帧</strong>{report.frames.length ? report.frames.map((frame, index) => <p key={`${frame.sequence}-${index}`}>#{frame.sequence || '?'} {frame.hex}{frame.rules?.length ? ` · 规则 ${frame.rules.join(', ')}` : ''}</p>) : <p>无</p>}</div></section>}
    </main>
  </div>;
}
