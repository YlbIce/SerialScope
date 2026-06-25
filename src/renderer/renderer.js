const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  ws: null,
  wsUrl: '',
  connected: false,
  serialOpen: false,
  ports: [],
  logs: [],
  pausedLogs: [],
  viewMode: 'mixed',
  autoSendTimer: null,
  metrics: {
    rxBytes: 0,
    txBytes: 0,
    rxFrames: 0,
    txFrames: 0,
    lastRxBytes: 0,
    lastTxBytes: 0,
    ruleHits: 0,
    rateHistory: [],
    samples: []
  },
  layout: {
    activePage: 'page-terminal',
    leftPanel: 300,
    rightPanel: 340,
    bottomPanel: 230,
    hiddenPanels: []
  }
};

const defaultRules = [
  { name: '错误', pattern: 'ERROR|FAIL|异常', color: 'red', hits: 0, enabled: true },
  { name: '告警', pattern: 'WARN|ALARM|告警', color: 'amber', hits: 0, enabled: true },
  { name: 'JSON 帧', pattern: '^\\s*\\{.*\\}\\s*$', color: 'cyan', hits: 0, enabled: true },
  { name: '温度字段', pattern: 'temp|temperature|℃|C$', color: 'green', hits: 0, enabled: true }
];

let rules = cloneRules(defaultRules);
let ruleDrafts = [];

const sampleColors = ['#39c98f', '#4dbbd7', '#e5b84d', '#ee6a5f', '#9d8cff', '#f28cc6'];
const defaultSampleRules = [
  {
    id: 'sample-regex-speed',
    enabled: true,
    name: '文本速度',
    type: 'regex',
    expression: 'speed\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)',
    group: 1,
    scale: 1,
    offset: 0,
    color: sampleColors[0],
    hits: 0,
    lastValue: null
  },
  {
    id: 'sample-json-speed',
    enabled: true,
    name: 'JSON speed',
    type: 'json',
    expression: '$.speed',
    group: 1,
    scale: 1,
    offset: 0,
    color: sampleColors[1],
    hits: 0,
    lastValue: null
  },
  {
    id: 'sample-csv-col0',
    enabled: false,
    name: 'CSV 第 1 列',
    type: 'csv',
    expression: '0',
    group: 1,
    scale: 1,
    offset: 0,
    color: sampleColors[2],
    hits: 0,
    lastValue: null
  },
  {
    id: 'sample-hex-u16',
    enabled: false,
    name: 'HEX U16[0]',
    type: 'hex',
    expression: '0:u16be',
    group: 1,
    scale: 1,
    offset: 0,
    color: sampleColors[3],
    hits: 0,
    lastValue: null
  },
  {
    id: 'sample-modbus-r0',
    enabled: false,
    name: 'Modbus 寄存器0',
    type: 'modbus',
    expression: '0:u16be',
    group: 1,
    scale: 1,
    offset: 0,
    color: sampleColors[4],
    hits: 0,
    lastValue: null
  }
];

let sampleRules = cloneSampleRules(defaultSampleRules);

const defaultMacros = [
  { name: 'AT', mode: 'text', data: 'AT', lineEnding: 'CRLF' },
  { name: '版本', mode: 'text', data: 'AT+GMR', lineEnding: 'CRLF' },
  { name: '重启', mode: 'text', data: 'AT+RST', lineEnding: 'CRLF' },
  { name: 'Modbus 读保持寄存器', mode: 'hex', data: '01 03 00 00 00 02', appendModbusCrc: true },
  { name: 'Modbus 写单寄存器', mode: 'hex', data: '01 06 00 01 00 64', appendModbusCrc: true },
  { name: '心跳', mode: 'hex', data: 'AA 55 00 01' }
];

function requestId() {
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

async function boot() {
  const info = await window.serialScope.getBackendInfo();
  state.wsUrl = info.wsUrl;
  $('#backendState').textContent = '连接中';
  bindEvents();
  restoreLayout();
  loadSavedRules();
  loadSampleRules();
  renderRules();
  renderSampleRules();
  renderMacros();
  restoreProfile();
  connectWebSocket();
  window.serialScope.onBackendLog((message) => addSystemLog(message.trim()));
  window.serialScope.onBackendExit(() => {
    state.connected = false;
    updateConnectionUi('Native C++ 后端已退出');
  });
  window.setInterval(updateRateMetrics, 1000);
  requestAnimationFrame(drawRateChart);
  requestAnimationFrame(drawSampleChart);
}

function connectWebSocket() {
  if (state.ws) {
    state.ws.close();
  }

  const ws = new WebSocket(state.wsUrl);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.connected = true;
    updateConnectionUi('后端已连接');
    sendCommand('ports:list');
  });

  ws.addEventListener('message', (event) => {
    handleMessage(JSON.parse(event.data));
  });

  ws.addEventListener('close', () => {
    state.connected = false;
    state.serialOpen = false;
    updateConnectionUi('后端未连接');
    window.setTimeout(connectWebSocket, 1200);
  });

  ws.addEventListener('error', () => {
    updateConnectionUi('后端连接失败');
  });
}

function sendCommand(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    showToast('Native C++ 后端未连接');
    return;
  }
  state.ws.send(JSON.stringify({ requestId: requestId(), type, payload }));
}

function handleMessage(message) {
  const payload = message.payload || {};
  if (message.type === 'backend:hello') {
    addSystemLog(`${payload.name} ${payload.version}`);
    return;
  }
  if (message.type === 'ports:list') {
    state.ports = payload.ports || [];
    renderPorts();
    return;
  }
  if (message.type === 'serial:state') {
    updateSerialState(payload);
    return;
  }
  if (message.type === 'serial:rx' || message.type === 'serial:tx') {
    addTransferLog(payload);
    return;
  }
  if (message.type === 'serial:error' || message.type === 'error') {
    addSystemLog(payload.message || '未知错误');
    showToast(payload.message || '串口错误');
    return;
  }
  if (message.type.endsWith(':result')) {
    if (payload.message) {
      showToast(payload.message);
    }
    if (payload.state) {
      updateSerialState(payload.state);
    }
  }
}

function updateConnectionUi(message) {
  $('#backendState').textContent = message;
  $('#startBackendButton').disabled = state.connected;
}

function switchPage(pageId) {
  const page = $(`#${pageId}`);
  if (!page) {
    return;
  }

  state.layout.activePage = pageId;
  $$('.page').forEach((item) => item.classList.toggle('active', item.id === pageId));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.pageTarget === pageId));
  $('#pageTitle').textContent = page.dataset.pageTitle || 'SerialScope';
  $('#pageEyebrow').textContent = page.dataset.pageEyebrow || '';
  persistLayout();
}

function restoreLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem('serialscope.layout'));
    if (saved && typeof saved === 'object') {
      state.layout = {
        ...state.layout,
        ...saved,
        hiddenPanels: Array.isArray(saved.hiddenPanels) ? saved.hiddenPanels : []
      };
    }
  } catch {
    state.layout.hiddenPanels = [];
  }

  applyDockLayout();
  switchPage(state.layout.activePage || 'page-terminal');
}

function persistLayout() {
  localStorage.setItem('serialscope.layout', JSON.stringify(state.layout));
}

function applyDockLayout() {
  const dock = $('#terminalDock');
  if (!dock) {
    return;
  }

  dock.style.setProperty('--left-panel', `${state.layout.leftPanel}px`);
  dock.style.setProperty('--right-panel', `${state.layout.rightPanel}px`);
  dock.style.setProperty('--bottom-panel', `${state.layout.bottomPanel}px`);
  for (const panel of ['connection', 'terminal', 'analysis', 'send']) {
    dock.classList.toggle(`hide-${panel}`, state.layout.hiddenPanels.includes(panel));
  }
  renderHiddenPanels();
}

function hidePanel(panelId) {
  if (!state.layout.hiddenPanels.includes(panelId)) {
    state.layout.hiddenPanels.push(panelId);
  }
  applyDockLayout();
  persistLayout();
}

function showPanel(panelId) {
  state.layout.hiddenPanels = state.layout.hiddenPanels.filter((item) => item !== panelId);
  applyDockLayout();
  persistLayout();
}

function resetLayout() {
  state.layout = {
    activePage: 'page-terminal',
    leftPanel: 300,
    rightPanel: 340,
    bottomPanel: 230,
    hiddenPanels: []
  };
  applyDockLayout();
  switchPage(state.layout.activePage);
  persistLayout();
  showToast('布局已恢复默认');
}

function renderHiddenPanels() {
  const container = $('#hiddenPanelList');
  if (!container) {
    return;
  }

  const names = {
    connection: '连接参数',
    terminal: '收发监视',
    analysis: '分析侧栏',
    send: '发送区'
  };
  container.innerHTML = state.layout.hiddenPanels.map((panelId) => `
    <button class="restore-panel-button" data-show-panel="${panelId}" type="button">显示 ${names[panelId] || panelId}</button>
  `).join('');

  $$('[data-show-panel]').forEach((button) => {
    button.addEventListener('click', () => showPanel(button.dataset.showPanel));
  });
}

function startSplitterDrag(event) {
  const splitter = event.currentTarget.dataset.splitter;
  const dock = $('#terminalDock');
  if (!splitter || !dock) {
    return;
  }

  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const start = { ...state.layout };
  const rect = dock.getBoundingClientRect();
  const horizontal = splitter === 'bottom';
  document.body.classList.add('dragging-splitter');
  document.body.classList.toggle('dragging-horizontal', horizontal);

  function move(pointerEvent) {
    if (splitter === 'left') {
      const next = start.leftPanel + pointerEvent.clientX - startX;
      state.layout.leftPanel = clamp(next, 220, Math.min(460, rect.width - 620));
    } else if (splitter === 'right') {
      const next = start.rightPanel - (pointerEvent.clientX - startX);
      state.layout.rightPanel = clamp(next, 260, Math.min(520, rect.width - 620));
    } else if (splitter === 'bottom') {
      const next = start.bottomPanel - (pointerEvent.clientY - startY);
      state.layout.bottomPanel = clamp(next, 160, Math.min(360, rect.height - 320));
    }
    applyDockLayout();
  }

  function stop() {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', stop);
    document.body.classList.remove('dragging-splitter', 'dragging-horizontal');
    persistLayout();
  }

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', stop);
}

function updateSerialState(payload) {
  state.serialOpen = Boolean(payload.isOpen);
  state.metrics.rxBytes = Number(payload.rxBytes || state.metrics.rxBytes);
  state.metrics.txBytes = Number(payload.txBytes || state.metrics.txBytes);
  state.metrics.rxFrames = Number(payload.rxFrames || state.metrics.rxFrames);
  state.metrics.txFrames = Number(payload.txFrames || state.metrics.txFrames);

  const pill = $('#serialState');
  pill.classList.toggle('offline', !state.serialOpen);
  pill.textContent = state.serialOpen ? `${payload.portName} 已打开` : '串口未打开';
  $('#rxMetric').textContent = `RX ${formatBytes(state.metrics.rxBytes)}`;
  $('#txMetric').textContent = `TX ${formatBytes(state.metrics.txBytes)}`;
  $('#frameMetric').textContent = `${state.metrics.rxFrames + state.metrics.txFrames} frames`;
  $('#rxFrameSummary').textContent = state.metrics.rxFrames;
  $('#txFrameSummary').textContent = state.metrics.txFrames;
  $('#rxByteSummary').textContent = formatBytes(state.metrics.rxBytes);
  $('#txByteSummary').textContent = formatBytes(state.metrics.txBytes);
}

function renderPorts() {
  const select = $('#portSelect');
  const current = select.value;
  select.innerHTML = '';

  if (state.ports.length === 0) {
    select.append(new Option('未发现串口', ''));
    return;
  }

  for (const port of state.ports) {
    const label = [port.portName, port.description, port.manufacturer].filter(Boolean).join(' · ');
    select.append(new Option(label, port.portName));
  }

  if (current && state.ports.some((port) => port.portName === current)) {
    select.value = current;
  }
}

function serialConfig() {
  return {
    portName: $('#portSelect').value,
    baudRate: Number($('#baudRateSelect').value),
    dataBits: Number($('#dataBitsSelect').value),
    parity: $('#paritySelect').value,
    stopBits: $('#stopBitsSelect').value,
    flowControl: $('#flowControlSelect').value
  };
}

function sendCurrentInput() {
  const payload = {
    mode: $('#sendModeSelect').value,
    data: $('#sendInput').value,
    lineEnding: $('#lineEndingSelect').value,
    appendModbusCrc: $('#crcCheck').checked
  };
  sendCommand('serial:send', payload);
}

function addTransferLog(payload) {
  if ($('#pauseReceiveCheck').checked && payload.direction === 'rx') {
    state.pausedLogs.push(payload);
    state.pausedLogs = state.pausedLogs.slice(-1000);
    return;
  }

  const matchedRules = matchRules(payload.text || '', payload.hex || '');
  const row = {
    time: new Date(payload.timestamp || Date.now()).toLocaleTimeString('zh-CN', { hour12: false }),
    direction: payload.direction,
    bytes: payload.bytes,
    text: payload.text || '',
    hex: payload.hex || '',
    hit: matchedRules.length > 0,
    rules: matchedRules
  };

  state.logs.push(row);
  state.logs = state.logs.slice(-2000);
  state.metrics.lastRxBytes = row.direction === 'rx' ? row.bytes : state.metrics.lastRxBytes;
  state.metrics.lastTxBytes = row.direction === 'tx' ? row.bytes : state.metrics.lastTxBytes;
  $('#lastFrameBytes').textContent = `${row.bytes} B`;
  if (row.direction === 'rx' && !$('#samplePauseCheck').checked) {
    extractSamples(row);
  }
  updateInspector(row);
  renderLog();
}

function addSystemLog(text) {
  if (!text) {
    return;
  }
  state.logs.push({
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    direction: 'sys',
    bytes: 0,
    text,
    hex: '',
    hit: false,
    rules: []
  });
  renderLog();
}

function matchRules(text, hex) {
  const matched = [];
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }
    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(text) || regex.test(hex)) {
      rule.hits += 1;
      state.metrics.ruleHits += 1;
      matched.push(rule.name);
    }
  }
  $('#ruleHits').textContent = state.metrics.ruleHits;
  updateRuleCounters();
  return matched;
}

function renderLog() {
  const filter = $('#filterInput').value.trim();
  const regex = safeRegex(filter);
  const rows = state.logs.filter((row) => {
    if (!regex) return true;
    return regex.test(row.text) || regex.test(row.hex) || regex.test(row.direction);
  });

  const mode = state.viewMode;
  $('#terminalLog').innerHTML = rows.slice(-600).map((row) => {
    const text = mode === 'hex' ? '' : escapeHtml(row.text);
    const hex = mode === 'text' ? '' : escapeHtml(row.hex);
    return `
      <div class="log-row ${row.direction} ${row.hit ? 'hit' : ''}">
        <span class="log-time">${row.time}</span>
        <span class="log-dir">${row.direction.toUpperCase()}</span>
        <span class="log-text">${text}</span>
        <span class="log-hex">${hex}</span>
      </div>
    `;
  }).join('');

  if ($('#autoScrollCheck').checked) {
    const terminal = $('#terminalLog');
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function updateInspector(row) {
  const bytes = row.hex ? row.hex.split(/\s+/).filter(Boolean) : [];
  const byteValues = bytes.map((item) => Number.parseInt(item, 16)).filter((item) => Number.isFinite(item));
  const modbus = analyzeModbusFrame(byteValues);
  const json = analyzeJsonFrame(row.text);
  const printableRatio = byteValues.length
    ? Math.round((byteValues.filter((item) => item >= 0x20 && item <= 0x7E).length / byteValues.length) * 100)
    : 0;
  const quality = [
    row.hit ? `规则命中：${row.rules.join('、')}` : '',
    json.ok ? 'JSON 有效' : '',
    modbus.available ? (modbus.valid ? 'Modbus CRC 正确' : 'Modbus CRC 异常') : ''
  ].filter(Boolean).join(' / ');

  $('#frameQuality').textContent = quality || '普通帧';
  $('#frameInspector').innerHTML = `
    <dt>方向</dt><dd>${row.direction.toUpperCase()}</dd>
    <dt>长度</dt><dd>${row.bytes} 字节</dd>
    <dt>ASCII</dt><dd>${escapeHtml(row.text || '-')}</dd>
    <dt>HEX</dt><dd>${escapeHtml(row.hex || '-')}</dd>
    <dt>首尾字节</dt><dd>${bytes.length ? `${bytes[0]} / ${bytes.at(-1)}` : '-'}</dd>
    <dt>可打印率</dt><dd>${printableRatio}%</dd>
    <dt>JSON</dt><dd>${json.ok ? `有效，字段 ${json.keys}` : json.reason}</dd>
    <dt>Modbus CRC</dt><dd>${modbus.available ? `${modbus.actual} / ${modbus.expected}，${modbus.valid ? '通过' : '失败'}` : '不足 4 字节'}</dd>
    <dt>命中规则</dt><dd>${row.rules.length ? row.rules.join('、') : '-'}</dd>
  `;
}

function analyzeJsonFrame(text) {
  const value = String(text || '').trim();
  if (!value.startsWith('{') && !value.startsWith('[')) {
    return { ok: false, reason: '非 JSON' };
  }
  try {
    const parsed = JSON.parse(value);
    const keys = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
    return { ok: true, keys };
  } catch {
    return { ok: false, reason: 'JSON 解析失败' };
  }
}

function analyzeModbusFrame(bytes) {
  if (bytes.length < 4) {
    return { available: false };
  }
  const data = bytes.slice(0, -2);
  const expectedValue = crc16Modbus(data);
  const actualValue = bytes.at(-2) | (bytes.at(-1) << 8);
  return {
    available: true,
    valid: expectedValue === actualValue,
    expected: wordHex(expectedValue),
    actual: wordHex(actualValue)
  };
}

function extractSamples(row) {
  const bytes = parseHexBytes(row.hex);
  let changed = false;
  for (const rule of sampleRules) {
    if (!rule.enabled) {
      continue;
    }
    const rawValue = extractSampleValue(rule, row, bytes);
    if (!Number.isFinite(rawValue)) {
      continue;
    }
    const value = rawValue * Number(rule.scale || 1) + Number(rule.offset || 0);
    rule.hits += 1;
    rule.lastValue = value;
    state.metrics.samples.push({
      t: Date.now(),
      ruleId: rule.id,
      name: rule.name,
      value,
      color: rule.color
    });
    changed = true;
  }

  if (changed) {
    state.metrics.samples = state.metrics.samples.slice(-1200);
    renderSampleRules();
    renderSampleLegend();
  }
}

function extractSampleValue(rule, row, bytes) {
  try {
    if (rule.type === 'regex') {
      const regex = new RegExp(rule.expression, 'i');
      const match = regex.exec(row.text) || regex.exec(row.hex);
      return match ? Number(match[Number(rule.group || 1)] ?? match[0]) : NaN;
    }
    if (rule.type === 'json') {
      const parsed = JSON.parse(String(row.text || '').trim());
      return Number(readJsonPath(parsed, rule.expression));
    }
    if (rule.type === 'csv') {
      const parts = String(row.text || '').trim().split(/[,\t;]/);
      return Number(parts[Number(rule.expression || 0)]);
    }
    if (rule.type === 'hex') {
      return readNumericBytes(bytes, rule.expression);
    }
    if (rule.type === 'modbus') {
      const modbus = decodeModbusPayload(bytes);
      return modbus ? readNumericBytes(modbus, rule.expression) : NaN;
    }
  } catch {
    return NaN;
  }
  return NaN;
}

function readJsonPath(value, path) {
  const normalized = String(path || '').replace(/^\$\.?/, '');
  if (!normalized) {
    return value;
  }
  return normalized.split('.').reduce((current, key) => {
    if (current == null) {
      return undefined;
    }
    const arrayMatch = /^([^\[]+)\[(\d+)\]$/.exec(key);
    if (arrayMatch) {
      return current[arrayMatch[1]]?.[Number(arrayMatch[2])];
    }
    return current[key];
  }, value);
}

function readNumericBytes(bytes, expression) {
  const [offsetText, typeText = 'u16be'] = String(expression || '0:u16be').split(':');
  const offset = Number(offsetText || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length) {
    return NaN;
  }
  const type = typeText.toLowerCase();
  const read = (index) => bytes[index] ?? 0;
  if (type === 'u8') return read(offset);
  if (type === 'i8') return read(offset) > 127 ? read(offset) - 256 : read(offset);
  if (offset + 1 >= bytes.length) return NaN;
  if (type === 'u16le') return read(offset) | (read(offset + 1) << 8);
  if (type === 'i16le') return signed16(read(offset) | (read(offset + 1) << 8));
  if (type === 'i16be') return signed16((read(offset) << 8) | read(offset + 1));
  if (type === 'u16be') return (read(offset) << 8) | read(offset + 1);
  if (offset + 3 >= bytes.length) return NaN;
  if (type === 'u32le') return (read(offset) | (read(offset + 1) << 8) | (read(offset + 2) << 16) | (read(offset + 3) << 24)) >>> 0;
  if (type === 'u32be') return (((read(offset) << 24) | (read(offset + 1) << 16) | (read(offset + 2) << 8) | read(offset + 3)) >>> 0);
  if (type === 'floatle' || type === 'floatbe') {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const source = type === 'floatle'
      ? [read(offset), read(offset + 1), read(offset + 2), read(offset + 3)]
      : [read(offset + 3), read(offset + 2), read(offset + 1), read(offset)];
    source.forEach((byte, index) => view.setUint8(index, byte));
    return view.getFloat32(0, true);
  }
  return NaN;
}

function decodeModbusPayload(bytes) {
  if (bytes.length < 5) {
    return null;
  }
  const functionCode = bytes[1];
  if ((functionCode === 3 || functionCode === 4) && bytes.length >= 5) {
    const count = bytes[2];
    return bytes.slice(3, 3 + count);
  }
  if (functionCode === 6 && bytes.length >= 6) {
    return bytes.slice(4, 6);
  }
  return null;
}

function signed16(value) {
  return value > 0x7FFF ? value - 0x10000 : value;
}

function parseHexBytes(hex) {
  return String(hex || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => Number.parseInt(item, 16))
    .filter((item) => Number.isFinite(item));
}

function renderRules() {
  const markup = rules.map((rule, index) => `
    <label class="rule-item">
      <input class="rule-toggle" data-rule-index="${index}" type="checkbox" ${rule.enabled ? 'checked' : ''} />
      <span>${rule.name}</span>
      <strong>${rule.hits}</strong>
    </label>
  `).join('');
  $('#ruleList').innerHTML = markup;
  const pageRuleList = $('#ruleListPage');
  if (pageRuleList) {
    pageRuleList.innerHTML = markup;
  }

  $$('.rule-toggle').forEach((input) => {
    input.addEventListener('change', () => {
      const rule = rules[Number(input.dataset.ruleIndex)];
      if (!rule) {
        return;
      }
      rule.enabled = input.checked;
      persistRules();
      recomputeRuleHits();
      renderLog();
    });
  });
}

function updateRuleCounters() {
  $$('.rule-toggle').forEach((input) => {
    const rule = rules[Number(input.dataset.ruleIndex)];
    if (!rule) {
      return;
    }
    input.checked = rule.enabled;
    const count = input.parentElement.querySelector('strong');
    if (count) {
      count.textContent = rule.hits;
    }
  });
}

function loadSavedRules() {
  try {
    const saved = JSON.parse(localStorage.getItem('serialscope.rules'));
    if (Array.isArray(saved) && saved.length > 0) {
      rules = normalizeRules(saved);
    }
  } catch {
    rules = cloneRules(defaultRules);
  }
}

function persistRules() {
  localStorage.setItem('serialscope.rules', JSON.stringify(rules.map(ruleToProfile)));
}

function openRuleConfig() {
  ruleDrafts = cloneRules(rules);
  renderRuleEditor();
  $('#ruleModal').hidden = false;
}

function closeRuleConfig() {
  $('#ruleModal').hidden = true;
}

function renderRuleEditor() {
  $('#ruleEditorList').innerHTML = ruleDrafts.map((rule, index) => `
    <div class="rule-editor-row" data-index="${index}">
      <label class="check-label">
        <input class="rule-editor-enabled" type="checkbox" ${rule.enabled ? 'checked' : ''} />
        启用
      </label>
      <label>
        <span>规则名称</span>
        <input class="rule-editor-name" type="text" value="${escapeAttribute(rule.name)}" />
      </label>
      <label>
        <span>正则表达式 / 关键字</span>
        <input class="rule-editor-pattern" type="text" value="${escapeAttribute(rule.pattern)}" />
      </label>
      <button class="danger-button rule-delete-button" type="button">删除</button>
    </div>
  `).join('');

  $$('.rule-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('.rule-editor-row').remove();
    });
  });
}

function addRuleEditorRow() {
  ruleDrafts.push({
    name: `规则 ${ruleDrafts.length + 1}`,
    pattern: '',
    color: 'cyan',
    hits: 0,
    enabled: true
  });
  renderRuleEditor();
}

function resetRulesToDefault() {
  ruleDrafts = cloneRules(defaultRules);
  renderRuleEditor();
}

function saveRuleConfig() {
  const nextRules = [];
  const names = new Set();
  for (const row of $$('.rule-editor-row')) {
    const name = row.querySelector('.rule-editor-name').value.trim();
    const pattern = row.querySelector('.rule-editor-pattern').value.trim();
    const enabled = row.querySelector('.rule-editor-enabled').checked;
    if (!name || !pattern) {
      showToast('规则名称和表达式不能为空');
      return;
    }
    if (names.has(name)) {
      showToast(`规则名称重复：${name}`);
      return;
    }
    names.add(name);
    try {
      new RegExp(pattern, 'i');
    } catch (error) {
      showToast(`规则 "${name}" 的正则无效：${error.message}`);
      return;
    }
    nextRules.push({ name, pattern, color: 'cyan', hits: 0, enabled });
  }

  if (nextRules.length === 0) {
    showToast('至少保留一条规则');
    return;
  }

  rules = normalizeRules(nextRules);
  persistRules();
  recomputeRuleHits();
  renderLog();
  closeRuleConfig();
  showToast('规则配置已保存');
}

function normalizeRules(sourceRules) {
  return sourceRules.map((rule, index) => ({
    name: String(rule.name || `规则 ${index + 1}`),
    pattern: String(rule.pattern || ''),
    color: rule.color || 'cyan',
    hits: 0,
    enabled: rule.enabled !== false
  })).filter((rule) => rule.name.trim() && rule.pattern.trim());
}

function cloneRules(sourceRules) {
  return sourceRules.map((rule) => ({ ...rule, hits: 0 }));
}

function ruleToProfile(rule) {
  return {
    name: rule.name,
    pattern: rule.pattern,
    color: rule.color,
    enabled: rule.enabled
  };
}

function loadSampleRules() {
  try {
    const saved = JSON.parse(localStorage.getItem('serialscope.sampleRules'));
    if (Array.isArray(saved) && saved.length > 0) {
      sampleRules = normalizeSampleRules(saved);
      return;
    }
  } catch {
    // 使用默认规则。
  }
  sampleRules = cloneSampleRules(defaultSampleRules);
}

function persistSampleRules() {
  localStorage.setItem('serialscope.sampleRules', JSON.stringify(sampleRules.map(sampleRuleToProfile)));
}

function renderSampleRules() {
  const container = $('#sampleRuleList');
  if (!container) {
    return;
  }

  container.innerHTML = sampleRules.map((rule, index) => `
    <section class="sample-rule-card ${rule.enabled ? '' : 'disabled'}" data-sample-index="${index}">
      <div class="sample-rule-head">
        <label class="check-label">
          <input class="sample-rule-enabled" type="checkbox" ${rule.enabled ? 'checked' : ''} />
          启用
        </label>
        <input class="sample-rule-name" type="text" value="${escapeAttribute(rule.name)}" aria-label="通道名称" />
        <select class="sample-rule-type" aria-label="规则类型">
          ${sampleRuleTypeOptions(rule.type)}
        </select>
        <button class="danger-button sample-rule-delete" type="button">删除</button>
      </div>
      <div class="sample-rule-fields">
        <label class="full">
          <span>${sampleExpressionLabel(rule.type)}</span>
          <input class="sample-rule-expression" type="text" value="${escapeAttribute(rule.expression)}" />
        </label>
        <label>
          <span>捕获组 / 保留</span>
          <input class="sample-rule-group" type="number" min="0" step="1" value="${Number(rule.group || 1)}" />
        </label>
        <label>
          <span>比例 scale</span>
          <input class="sample-rule-scale" type="number" step="0.0001" value="${Number(rule.scale || 1)}" />
        </label>
        <label>
          <span>偏移 offset</span>
          <input class="sample-rule-offset" type="number" step="0.0001" value="${Number(rule.offset || 0)}" />
        </label>
        <label>
          <span>颜色</span>
          <input class="sample-rule-color" type="color" value="${escapeAttribute(rule.color)}" />
        </label>
      </div>
      <div class="sample-rule-status">命中 ${rule.hits} 次，最近值 ${rule.lastValue == null ? '-' : formatNumber(rule.lastValue)}</div>
    </section>
  `).join('');

  $$('.sample-rule-card').forEach((card) => {
    card.addEventListener('input', () => updateSampleRuleFromCard(card));
    card.addEventListener('change', () => updateSampleRuleFromCard(card));
  });
  $$('.sample-rule-delete').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.closest('.sample-rule-card').dataset.sampleIndex);
      sampleRules.splice(index, 1);
      persistSampleRules();
      renderSampleRules();
      renderSampleLegend();
    });
  });
}

function updateSampleRuleFromCard(card) {
  const rule = sampleRules[Number(card.dataset.sampleIndex)];
  if (!rule) {
    return;
  }
  rule.enabled = card.querySelector('.sample-rule-enabled').checked;
  rule.name = card.querySelector('.sample-rule-name').value.trim() || '未命名通道';
  rule.type = card.querySelector('.sample-rule-type').value;
  rule.expression = card.querySelector('.sample-rule-expression').value.trim();
  rule.group = Number(card.querySelector('.sample-rule-group').value || 1);
  rule.scale = Number(card.querySelector('.sample-rule-scale').value || 1);
  rule.offset = Number(card.querySelector('.sample-rule-offset').value || 0);
  rule.color = card.querySelector('.sample-rule-color').value || rule.color;
  persistSampleRules();
  renderSampleLegend();
  card.classList.toggle('disabled', !rule.enabled);
}

function addSampleRuleFromPreset() {
  const type = $('#samplePresetSelect').value;
  const templates = {
    regex: { name: '文本数值', type: 'regex', expression: 'value\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)', group: 1 },
    json: { name: 'JSON value', type: 'json', expression: '$.value', group: 1 },
    csv: { name: 'CSV 列', type: 'csv', expression: '0', group: 1 },
    hex: { name: 'HEX 数值', type: 'hex', expression: '0:u16be', group: 1 },
    modbus: { name: 'Modbus 寄存器', type: 'modbus', expression: '0:u16be', group: 1 }
  };
  const template = templates[type] || templates.regex;
  sampleRules.push({
    id: `sample-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: true,
    scale: 1,
    offset: 0,
    color: sampleColors[sampleRules.length % sampleColors.length],
    hits: 0,
    lastValue: null,
    ...template
  });
  persistSampleRules();
  renderSampleRules();
  renderSampleLegend();
}

function sampleRuleTypeOptions(current) {
  const options = [
    ['regex', '文本正则'],
    ['json', 'JSON 路径'],
    ['csv', 'CSV 列'],
    ['hex', 'HEX 偏移'],
    ['modbus', 'Modbus 寄存器']
  ];
  return options.map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`).join('');
}

function sampleExpressionLabel(type) {
  if (type === 'regex') return '正则表达式，默认读取捕获组';
  if (type === 'json') return 'JSON 路径，例如 $.speed 或 $.motor.rpm';
  if (type === 'csv') return '列索引，从 0 开始';
  if (type === 'hex') return '字节偏移:类型，例如 0:u16be、2:i16le、4:floatle';
  if (type === 'modbus') return '寄存器数据偏移:类型，例如 0:u16be';
  return '表达式';
}

function normalizeSampleRules(sourceRules) {
  return sourceRules.map((rule, index) => ({
    id: rule.id || `sample-${index}-${Date.now()}`,
    enabled: rule.enabled !== false,
    name: String(rule.name || `采集通道 ${index + 1}`),
    type: ['regex', 'json', 'csv', 'hex', 'modbus'].includes(rule.type) ? rule.type : 'regex',
    expression: String(rule.expression || ''),
    group: Number(rule.group || 1),
    scale: Number(rule.scale || 1),
    offset: Number(rule.offset || 0),
    color: rule.color || sampleColors[index % sampleColors.length],
    hits: 0,
    lastValue: null
  })).filter((rule) => rule.name && rule.expression);
}

function cloneSampleRules(sourceRules) {
  return sourceRules.map((rule) => ({ ...rule, hits: 0, lastValue: null }));
}

function sampleRuleToProfile(rule) {
  return {
    id: rule.id,
    enabled: rule.enabled,
    name: rule.name,
    type: rule.type,
    expression: rule.expression,
    group: rule.group,
    scale: rule.scale,
    offset: rule.offset,
    color: rule.color
  };
}

function renderSampleLegend() {
  const legend = $('#sampleLegend');
  if (!legend) {
    return;
  }
  legend.innerHTML = sampleRules.map((rule) => `
    <span class="legend-chip">
      <i class="legend-swatch" style="background:${escapeAttribute(rule.color)}"></i>
      ${escapeHtml(rule.name)} ${rule.lastValue == null ? '-' : formatNumber(rule.lastValue)}
    </span>
  `).join('');
}

function renderMacros() {
  const macros = loadMacros();
  $('#macroGrid').innerHTML = macros.map((macro, index) => `
    <button class="macro-button" data-index="${index}" type="button">
      <strong>${escapeHtml(macro.name)}</strong>
      <span>${escapeHtml(macro.mode.toUpperCase())} · ${escapeHtml(macro.data)}</span>
    </button>
  `).join('');

  $$('.macro-button').forEach((button) => {
    button.addEventListener('click', () => {
      const macro = macros[Number(button.dataset.index)];
      $('#sendModeSelect').value = macro.mode;
      $('#sendInput').value = macro.data;
      $('#lineEndingSelect').value = macro.lineEnding || 'none';
      $('#crcCheck').checked = Boolean(macro.appendModbusCrc);
      sendCommand('serial:send', macro);
    });
  });
}

function loadMacros() {
  try {
    return JSON.parse(localStorage.getItem('serialscope.macros')) || defaultMacros;
  } catch {
    return defaultMacros;
  }
}

function currentProfile() {
  return {
    name: '本地配置',
    serial: serialConfig(),
    sendMode: $('#sendModeSelect').value,
    sendText: $('#sendInput').value,
    lineEnding: $('#lineEndingSelect').value,
    appendCrc: $('#crcCheck').checked,
    autoSendInterval: Number($('#autoSendInterval').value || 1000),
    viewMode: state.viewMode,
    rules: rules.map(ruleToProfile),
    sampleRules: sampleRules.map(sampleRuleToProfile),
    macros: loadMacros()
  };
}

async function saveProfile() {
  const profile = currentProfile();

  if (window.serialScope.saveTextFile) {
    const result = await window.serialScope.saveTextFile({
      title: '保存 SerialScope 配置',
      defaultPath: `serialscope-profile-${dateStamp()}.json`,
      filters: [{ name: 'SerialScope Profile', extensions: ['json'] }],
      content: `${JSON.stringify(profile, null, 2)}\n`
    });
    if (!result.canceled && !result.ok) {
      showToast(result.message || '配置保存失败');
      return;
    }
    if (result.ok) {
      showToast(`配置已保存：${result.filePath}`);
    }
  } else {
    showToast('配置已保存到本地存储');
  }

  localStorage.setItem('serialscope.profile', JSON.stringify(profile));
  $('#profileName').textContent = profile.name;
}

function applyProfile(profile) {
  if (!profile) {
    return;
  }
  $('#profileName').textContent = profile.name || '本地配置';
  if (profile.serial) {
    $('#baudRateSelect').value = String(profile.serial.baudRate || 115200);
    $('#dataBitsSelect').value = String(profile.serial.dataBits || 8);
    $('#paritySelect').value = profile.serial.parity || 'none';
    $('#stopBitsSelect').value = profile.serial.stopBits || '1';
    $('#flowControlSelect').value = profile.serial.flowControl || 'none';
  }
  $('#sendModeSelect').value = profile.sendMode || 'text';
  $('#sendModeLabel').textContent = $('#sendModeSelect').value.toUpperCase();
  if (typeof profile.sendText === 'string') {
    $('#sendInput').value = profile.sendText;
  }
  $('#lineEndingSelect').value = profile.lineEnding || 'CRLF';
  $('#crcCheck').checked = Boolean(profile.appendCrc);
  $('#autoSendInterval').value = Number(profile.autoSendInterval || 1000);
  if (Array.isArray(profile.macros)) {
    localStorage.setItem('serialscope.macros', JSON.stringify(profile.macros));
    renderMacros();
  }
  if (Array.isArray(profile.rules)) {
    rules = normalizeRules(profile.rules);
    persistRules();
    recomputeRuleHits();
  }
  if (Array.isArray(profile.sampleRules)) {
    sampleRules = normalizeSampleRules(profile.sampleRules);
    persistSampleRules();
    renderSampleRules();
    renderSampleLegend();
  }
}

function restoreProfile() {
  const raw = localStorage.getItem('serialscope.profile');
  if (!raw) {
    return;
  }
  applyProfile(JSON.parse(raw));
}

async function loadProfileFile() {
  if (!window.serialScope.openJsonFile) {
    restoreProfile();
    showToast('配置已加载');
    return;
  }

  const result = await window.serialScope.openJsonFile({
    title: '加载 SerialScope 配置',
    filters: [{ name: 'SerialScope Profile', extensions: ['json'] }]
  });
  if (result.canceled) {
    return;
  }
  if (!result.ok) {
    showToast(result.message || '配置加载失败');
    return;
  }
  applyProfile(result.data);
  localStorage.setItem('serialscope.profile', JSON.stringify(result.data));
  showToast(`配置已加载：${result.filePath}`);
}

function updateRateMetrics() {
  const last = state.metrics.rateHistory.at(-1) || { rx: state.metrics.rxBytes, tx: state.metrics.txBytes };
  const rxRate = Math.max(0, state.metrics.rxBytes - last.rx);
  const txRate = Math.max(0, state.metrics.txBytes - last.tx);
  state.metrics.rateHistory.push({ rx: state.metrics.rxBytes, tx: state.metrics.txBytes, rxRate, txRate });
  state.metrics.rateHistory = state.metrics.rateHistory.slice(-80);
  $('#rxRate').textContent = `${formatBytes(rxRate)}/s`;
  $('#txRate').textContent = `${formatBytes(txRate)}/s`;
}

function drawRateChart() {
  const canvas = $('#rateCanvas');
  if (!canvas || canvas.offsetParent === null) {
    requestAnimationFrame(drawRateChart);
    return;
  }
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#121519';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.strokeStyle = '#27313a';
  for (let x = 0; x < rect.width; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }
  drawSeries(ctx, rect, state.metrics.rateHistory.map((item) => item.rxRate), '#39c98f');
  drawSeries(ctx, rect, state.metrics.rateHistory.map((item) => item.txRate), '#4dbbd7');
  requestAnimationFrame(drawRateChart);
}

function drawSampleChart() {
  const canvas = $('#sampleCanvas');
  if (!canvas || canvas.offsetParent === null) {
    requestAnimationFrame(drawSampleChart);
    return;
  }

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#0d0f12';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const padding = { left: 54, right: 16, top: 16, bottom: 28 };
  const plot = {
    x: padding.left,
    y: padding.top,
    width: Math.max(1, rect.width - padding.left - padding.right),
    height: Math.max(1, rect.height - padding.top - padding.bottom)
  };

  drawGrid(ctx, plot);
  const samples = state.metrics.samples.slice(-600);
  if (samples.length === 0) {
    ctx.fillStyle = '#717d8b';
    ctx.font = '13px Segoe UI';
    ctx.fillText('等待采集数据：启用规则后，接收帧命中数值会显示在这里', plot.x + 12, plot.y + 24);
    requestAnimationFrame(drawSampleChart);
    return;
  }

  const values = samples.map((sample) => sample.value).filter(Number.isFinite);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;

  const firstTime = samples[0].t;
  const lastTime = samples.at(-1).t;
  const timeSpan = Math.max(1, lastTime - firstTime);

  ctx.fillStyle = '#9aa7b4';
  ctx.font = '12px Segoe UI';
  ctx.fillText(formatNumber(max), 8, plot.y + 12);
  ctx.fillText(formatNumber(min), 8, plot.y + plot.height);

  for (const rule of sampleRules) {
    const points = samples.filter((sample) => sample.ruleId === rule.id);
    if (points.length === 0) {
      continue;
    }
    ctx.strokeStyle = rule.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((sample, index) => {
      const x = plot.x + ((sample.t - firstTime) / timeSpan) * plot.width;
      const y = plot.y + plot.height - ((sample.value - min) / (max - min)) * plot.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = points.at(-1);
    const x = plot.x + ((last.t - firstTime) / timeSpan) * plot.width;
    const y = plot.y + plot.height - ((last.value - min) / (max - min)) * plot.height;
    ctx.fillStyle = rule.color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawSampleChart);
}

function drawGrid(ctx, plot) {
  ctx.strokeStyle = '#242b33';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i += 1) {
    const x = plot.x + (plot.width / 6) * i;
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.height);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i += 1) {
    const y = plot.y + (plot.height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#303943';
  ctx.strokeRect(plot.x, plot.y, plot.width, plot.height);
}

function drawSeries(ctx, rect, values, color) {
  if (values.length < 2) return;
  const max = Math.max(32, ...values);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = (index / 79) * rect.width;
    const y = rect.height - 8 - (value / max) * (rect.height - 16);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function bindEvents() {
  $$('.nav-item').forEach((button) => {
    button.addEventListener('click', () => switchPage(button.dataset.pageTarget));
  });
  $$('.splitter').forEach((splitter) => {
    splitter.addEventListener('pointerdown', startSplitterDrag);
  });
  $$('[data-hide-panel]').forEach((button) => {
    button.addEventListener('click', () => hidePanel(button.dataset.hidePanel));
  });
  $('#resetLayoutButton').addEventListener('click', resetLayout);
  $('#startBackendButton').addEventListener('click', async () => {
    const result = await window.serialScope.startBackend();
    showToast(result.message);
    window.setTimeout(connectWebSocket, 500);
  });
  $('#refreshPortsButton').addEventListener('click', () => sendCommand('ports:list'));
  $('#openButton').addEventListener('click', () => sendCommand('serial:open', serialConfig()));
  $('#closeButton').addEventListener('click', () => sendCommand('serial:close'));
  $('#sendButton').addEventListener('click', sendCurrentInput);
  $('#clearLogButton').addEventListener('click', () => {
    state.logs = [];
    state.pausedLogs = [];
    resetRuleHits();
    $('#frameQuality').textContent = '等待数据';
    $('#frameInspector').innerHTML = '';
    renderLog();
  });
  $('#exportLogButton').addEventListener('click', exportLog);
  $('#addSampleRuleButton').addEventListener('click', addSampleRuleFromPreset);
  $('#clearSamplesButton').addEventListener('click', clearSamples);
  $('#exportSamplesButton').addEventListener('click', exportSamples);
  $('#filterInput').addEventListener('input', renderLog);
  $('#sendModeSelect').addEventListener('change', () => {
    $('#sendModeLabel').textContent = $('#sendModeSelect').value.toUpperCase();
  });
  $('#autoSendCheck').addEventListener('change', updateAutoSend);
  $('#autoSendInterval').addEventListener('change', updateAutoSend);
  $('#saveProfileButton').addEventListener('click', saveProfile);
  $('#loadProfileButton').addEventListener('click', loadProfileFile);
  $('#pauseReceiveCheck').addEventListener('change', flushPausedLogs);
  $('#openRuleConfigButton').addEventListener('click', openRuleConfig);
  $('#openRuleConfigInlineButton').addEventListener('click', openRuleConfig);
  $('#openRuleConfigPageButton').addEventListener('click', openRuleConfig);
  $('#closeRuleModalButton').addEventListener('click', closeRuleConfig);
  $('#cancelRuleConfigButton').addEventListener('click', closeRuleConfig);
  $('#addRuleButton').addEventListener('click', addRuleEditorRow);
  $('#resetRulesButton').addEventListener('click', resetRulesToDefault);
  $('#saveRuleConfigButton').addEventListener('click', saveRuleConfig);
  $('#ruleModal').addEventListener('click', (event) => {
    if (event.target === $('#ruleModal')) {
      closeRuleConfig();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#ruleModal').hidden) {
      closeRuleConfig();
    }
  });
  $$('.segment').forEach((button) => {
    button.addEventListener('click', () => {
      state.viewMode = button.dataset.viewMode;
      $$('.segment').forEach((item) => item.classList.toggle('active', item === button));
      renderLog();
    });
  });
}

function updateAutoSend() {
  if (state.autoSendTimer) {
    window.clearInterval(state.autoSendTimer);
    state.autoSendTimer = null;
  }
  if ($('#autoSendCheck').checked) {
    const interval = Math.max(50, Number($('#autoSendInterval').value || 1000));
    state.autoSendTimer = window.setInterval(sendCurrentInput, interval);
  }
}

async function exportLog() {
  const lines = state.logs.map((row) => [row.time, row.direction, row.bytes, row.text, row.hex].map(csvCell).join(','));
  const content = `time,direction,bytes,text,hex\n${lines.join('\n')}`;
  if (window.serialScope.saveTextFile) {
    const result = await window.serialScope.saveTextFile({
      title: '导出串口日志',
      defaultPath: `serialscope-log-${dateStamp()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      content
    });
    if (!result.canceled) {
      showToast(result.ok ? `日志已导出：${result.filePath}` : result.message || '日志导出失败');
    }
    return;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `serialscope-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearSamples() {
  state.metrics.samples = [];
  for (const rule of sampleRules) {
    rule.hits = 0;
    rule.lastValue = null;
  }
  renderSampleRules();
  renderSampleLegend();
  showToast('采集曲线已清空');
}

async function exportSamples() {
  const lines = state.metrics.samples.map((sample) => [
    new Date(sample.t).toISOString(),
    sample.name,
    sample.value
  ].map(csvCell).join(','));
  const content = `time,channel,value\n${lines.join('\n')}`;
  if (window.serialScope.saveTextFile) {
    const result = await window.serialScope.saveTextFile({
      title: '导出采集数据',
      defaultPath: `serialscope-samples-${dateStamp()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      content
    });
    if (!result.canceled) {
      showToast(result.ok ? `采集数据已导出：${result.filePath}` : result.message || '采集数据导出失败');
    }
    return;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `serialscope-samples-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function safeRegex(value) {
  if (!value) {
    return null;
  }
  try {
    return new RegExp(value, 'i');
  } catch {
    return new RegExp(escapeRegex(value), 'i');
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flushPausedLogs() {
  if ($('#pauseReceiveCheck').checked || state.pausedLogs.length === 0) {
    return;
  }
  const pending = state.pausedLogs.splice(0);
  for (const payload of pending) {
    addTransferLog(payload);
  }
  showToast(`已补入 ${pending.length} 条暂停期间接收的数据`);
}

function resetRuleHits() {
  for (const rule of rules) {
    rule.hits = 0;
  }
  state.metrics.ruleHits = 0;
  $('#ruleHits').textContent = '0';
  renderRules();
}

function recomputeRuleHits() {
  resetRuleHits();
  for (const row of state.logs) {
    const matched = [];
    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(row.text) || regex.test(row.hex)) {
        rule.hits += 1;
        state.metrics.ruleHits += 1;
        matched.push(rule.name);
      }
    }
    row.rules = matched;
    row.hit = matched.length > 0;
  }
  $('#ruleHits').textContent = state.metrics.ruleHits;
  renderRules();
}

function crc16Modbus(bytes) {
  let crc = 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
    }
  }
  return crc & 0xFFFF;
}

function wordHex(value) {
  return `0x${(value & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
    return Number(value).toExponential(2);
  }
  return Number(value).toFixed(3).replace(/\.?0+$/, '');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

boot();
