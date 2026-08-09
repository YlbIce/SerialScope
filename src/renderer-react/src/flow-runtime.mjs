export class FlowExecutionError extends Error {
  constructor(message, report) {
    super(message);
    this.name = 'FlowExecutionError';
    this.report = report;
  }
}

export function normalizeHex(value = '') {
  return String(value).toUpperCase().replace(/[^0-9A-F]/g, '');
}

export function resolveTemplate(value, variables = {}) {
  return String(value ?? '').replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g, (_all, key) => String(variables[key] ?? ''));
}

export function snapshotForReport(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
    Object.freeze(item);
    for (const nested of Object.values(item)) freeze(nested);
    return item;
  };
  return freeze(copy);
}

function findNext(edges, source, outcome = 'next') {
  const outgoing = edges.filter((edge) => edge.source === source);
  return outgoing.find((edge) => edge.sourceHandle === outcome || edge.data?.outcome === outcome)
    || (outcome === 'next' ? outgoing.find((edge) => !edge.sourceHandle && !edge.data?.outcome) : undefined)
    || (outcome === 'true' ? outgoing.find((edge) => edge.label === '满足') : undefined)
    || (outcome === 'false' ? outgoing.find((edge) => edge.label === '不满足') : undefined);
}

function compare(actual, expected, operator = 'equals') {
  const left = String(actual ?? '');
  const right = String(expected ?? '');
  if (operator === 'contains') return left.includes(right);
  if (operator === 'startsWith') return left.startsWith(right);
  if (operator === 'notEmpty') return left.length > 0;
  if (operator === 'greaterThan') return Number(left) > Number(right);
  if (operator === 'lessThan') return Number(left) < Number(right);
  return left === right;
}

function frameBytes(frame) {
  const hex = normalizeHex(frame?.hex);
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  return Uint8Array.from(hex.match(/../g).map((item) => Number.parseInt(item, 16)));
}

function numericField(bytes, offset, type = 'uint8') {
  const byteOffset = Number(offset);
  const widths = { uint8: 1, int8: 1, uint16be: 2, uint16le: 2, int16be: 2, int16le: 2, uint32be: 4, uint32le: 4, int32be: 4, int32le: 4, float32be: 4, float32le: 4 };
  const width = widths[type];
  if (!width) return undefined;
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + width > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = type.endsWith('le');
  if (type === 'int8') return view.getInt8(byteOffset);
  if (type === 'uint16be' || type === 'uint16le') return view.getUint16(byteOffset, littleEndian);
  if (type === 'int16be' || type === 'int16le') return view.getInt16(byteOffset, littleEndian);
  if (type === 'uint32be' || type === 'uint32le') return view.getUint32(byteOffset, littleEndian);
  if (type === 'int32be' || type === 'int32le') return view.getInt32(byteOffset, littleEndian);
  if (type === 'float32be' || type === 'float32le') return view.getFloat32(byteOffset, littleEndian);
  return view.getUint8(byteOffset);
}

function modbusCrc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
  }
  return crc;
}

function evaluateModbusRegister(data, frame, expected, operator) {
  const bytes = frameBytes(frame);
  const functionCode = Number(data.modbusFunction ?? 3);
  const startAddress = Number(data.modbusStartAddress ?? 0);
  const registerAddress = Number(data.modbusRegisterAddress ?? startAddress);
  if (!bytes || !Number.isInteger(startAddress) || !Number.isInteger(registerAddress) || registerAddress < startAddress) return false;
  if (bytes.length < 5 || bytes[1] !== functionCode || ![3, 4].includes(functionCode)) return false;
  const expectedUnit = String(data.modbusUnit ?? '').trim();
  if (expectedUnit && bytes[0] !== Number(expectedUnit)) return false;
  const byteCount = bytes[2];
  const expectedLength = 3 + byteCount + 2;
  if (byteCount === 0 || byteCount % 2 !== 0 || bytes.length !== expectedLength) return false;
  const receivedCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  if (modbusCrc16(bytes.subarray(0, -2)) !== receivedCrc) return false;
  const payload = bytes.subarray(3, 3 + byteCount);
  const value = numericField(payload, (registerAddress - startAddress) * 2, data.fieldType || 'uint16be');
  return value !== undefined && compare(value, expected, operator);
}

export function evaluatePredicate(data, context) {
  const type = data.conditionType || data.matchType || 'hex';
  const operator = data.operator || (type === 'hex' ? 'startsWith' : 'equals');
  const expected = resolveTemplate(data.expected ?? data.expectedHex ?? '', context.variables);
  if (type === 'hex') {
    const actual = normalizeHex(context.lastFrame?.hex);
    const normalizedExpected = normalizeHex(expected);
    if (operator === 'contains') return actual.includes(normalizedExpected);
    if (operator === 'equals') return actual === normalizedExpected;
    return actual.startsWith(normalizedExpected);
  }
  if (type === 'text') return compare(context.lastFrame?.text ?? context.lastFrame?.hex, expected, operator);
  if (type === 'textRegex') {
    try { return new RegExp(expected, data.regexFlags || '').test(context.lastFrame?.text ?? ''); } catch { return false; }
  }
  if (type === 'byteField') {
    const bytes = frameBytes(context.lastFrame);
    const value = bytes && numericField(bytes, data.byteOffset, data.fieldType || 'uint8');
    return value !== undefined && value !== null && compare(value, expected, operator);
  }
  if (type === 'modbusRegister') return evaluateModbusRegister(data, context.lastFrame, expected, operator);
  if (type === 'rule') return compare((context.lastFrame?.rules || []).join(','), expected, operator === 'equals' ? 'contains' : operator);
  return compare(context.variables[data.variable || ''], expected, operator);
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new DOMException('流程已由用户取消', 'AbortError');
}

function sleep(milliseconds, signal) {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('流程已由用户取消', 'AbortError'));
    }, { once: true });
  });
}

export async function executeFlowGraph({ nodes, edges, operations, variables = {}, signal, onStatus, onMacroExecuted, maxSteps = 500, now = () => Date.now() }) {
  const startedAt = now();
  const report = { version: 1, startedAt, endedAt: null, durationMs: 0, result: 'running', variables: { ...variables }, frames: [], steps: [] };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = nodes.find((node) => node.data?.kind === 'start' || node.id === 'start' || node.type === 'input');
  if (!start) throw new FlowExecutionError('流程缺少开始节点', { ...report, result: 'failed' });
  const loopState = new Map();
  let current = start;
  let lastFrame;
  let steps = 0;

  const finish = (result, error) => ({ ...report, endedAt: now(), durationMs: now() - startedAt, result, error: error ? { message: error.message, name: error.name } : undefined });
  try {
    while (current) {
      assertNotAborted(signal);
      if (++steps > maxSteps) throw new Error(`流程超过安全步数上限 ${maxSteps}`);
      const data = current.data || {};
      const kind = data.kind || (current.id === 'start' ? 'start' : 'end');
      const step = { nodeId: current.id, label: data.label || current.id, kind, startedAt: now(), status: 'running' };
      report.steps.push(step);
      onStatus?.({ state: 'running', nodeId: current.id, detail: step.label, report: { ...report } });
      let outcome = 'next';

      if (kind === 'macro' || kind === 'write') {
        const dataToSend = resolveTemplate(data.hex ?? data.data ?? '', report.variables);
        await operations.send({ mode: data.mode || 'hex', data: dataToSend, lineEnding: data.lineEnding || 'none', appendModbusCrc: Boolean(data.appendModbusCrc) });
        report.variables.lastSend = dataToSend;
        // 宏快照只在真实发出后记录；未走到的分支和发送失败的宏不应出现在复现报告中。
        if (kind === 'macro' && data.macroSnapshot) onMacroExecuted?.(snapshotForReport(data.macroSnapshot), current.id);
      } else if (kind === 'read') {
        const waitType = data.conditionType || 'hex';
        const expected = resolveTemplate(data.expected ?? data.expectedHex ?? '', report.variables);
        onStatus?.({ state: 'waiting', nodeId: current.id, detail: `${data.label || '等待报文'}：等待 ${waitType}${expected ? ` = ${expected}` : ''}`, report: { ...report } });
        lastFrame = await operations.waitForFrame({ timeoutMs: Number(data.timeoutMs || 500), predicate: (frame) => evaluatePredicate(data, { variables: report.variables, lastFrame: frame }), signal });
        report.frames.push(lastFrame);
        report.variables[data.storeAs || 'lastFrame'] = lastFrame.hex;
      } else if (kind === 'condition') {
        outcome = evaluatePredicate(data, { variables: report.variables, lastFrame }) ? 'true' : 'false';
      } else if (kind === 'assign') {
        const key = data.variable;
        if (!key) throw new Error('变量赋值节点缺少变量名');
        report.variables[key] = resolveTemplate(data.value, report.variables);
      } else if (kind === 'assert') {
        if (!evaluatePredicate(data, { variables: report.variables, lastFrame })) throw new Error(data.message || `断言失败：${data.label || current.id}`);
      } else if (kind === 'delay') {
        await sleep(Number(data.durationMs ?? data.timeoutMs ?? 100), signal);
      } else if (kind === 'loop') {
        const state = loopState.get(current.id) || { startedAt: now(), count: 0 };
        state.count += 1;
        loopState.set(current.id, state);
        const withinCount = state.count <= Math.max(1, Number(data.maxIterations || 1));
        const maxDurationMs = Math.max(1, Number(data.maxDurationMs || 10000));
        const intervalMs = Math.max(0, Number(data.intervalMs || 0));
        const elapsed = now() - state.startedAt;
        const withinTime = elapsed + intervalMs <= maxDurationMs;
        report.variables[`${current.id}.iterations`] = state.count;
        if (!withinCount || !withinTime) {
          const boundary = !withinCount ? `最大次数 ${Math.max(1, Number(data.maxIterations || 1))}` : `最大耗时 ${maxDurationMs} ms`;
          throw new Error(`循环“${data.label || current.id}”达到${boundary}，已停止后续串口写入`);
        }
        outcome = 'loop';
        await sleep(intervalMs, signal);
      }

      step.endedAt = now();
      step.durationMs = step.endedAt - step.startedAt;
      step.status = 'passed';
      step.outcome = outcome;
      if (kind === 'end' || current.type === 'output') {
        if (data.result === 'failed') throw new Error(data.message || data.label || '流程进入失败结束节点');
        return finish('passed');
      }
      const edge = findNext(edges, current.id, outcome);
      if (!edge) throw new Error(`节点“${data.label || current.id}”缺少 ${outcome} 出边`);
      onStatus?.({ state: 'transition', nodeId: current.id, outcome, detail: `走向 ${outcome} 分支`, report: { ...report } });
      current = byId.get(edge.target);
      if (!current) throw new Error(`流程边指向不存在的节点：${edge.target}`);
    }
    throw new Error('流程意外结束');
  } catch (error) {
    const step = report.steps.at(-1);
    if (step && step.status === 'running') {
      step.endedAt = now();
      step.durationMs = step.endedAt - step.startedAt;
      step.status = error.name === 'AbortError' ? 'cancelled' : 'failed';
      step.error = error.message;
    }
    const result = error.name === 'AbortError' ? 'cancelled' : 'failed';
    const completed = finish(result, error);
    onStatus?.({ state: result, nodeId: current?.id || '', detail: error.message, report: completed });
    throw new FlowExecutionError(error.message, completed);
  }
}
