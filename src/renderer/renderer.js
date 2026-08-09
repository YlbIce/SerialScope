const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const setText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value;
};
const standaloneModule = new URLSearchParams(window.location.search).get('module');

const state = {
  connected: false,
  reconnectTimer: null,
  reconnectAttempts: 0,
  logRenderScheduled: false,
  serialOpen: false,
  ports: [],
  logs: [],
  pausedLogs: [],
  viewMode: 'mixed',
  autoQuery: {
    timer: null,
    timeoutTimer: null,
    inFlight: false,
    activeToken: 0,
    nextToken: 0,
    sendSettled: false,
    responseReceived: false,
    timeoutObserved: false,
    sequence: 0,
    sent: 0,
    responses: 0,
    timeouts: 0,
    startedAt: 0
  },
  logSequence: 0,
  simulatorSendChain: Promise.resolve(),
  simulatorReceiveBuffer: { hex: '', text: '', timer: null, deadlineTimer: null },
  simulatorOwner: !standaloneModule,
  simulatorAutoPortVerified: false,
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
  },
  ai: {
    enabled: false,
    allowDataUpload: false,
    includeSerialData: false,
    protocol: null,
    generatedCommands: []
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
let selectedMacroIndex = 0;

const defaultSimulator = {
  enabled: false,
  builtIn: 'none',
  delayMs: 20,
  rules: []
};
let simulator = loadSimulator();
let simulatorBootstrapConfig = null;

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
  await window.serialScope.getBackendInfo();
  const bootstrap = window.serialScope.getSimulatorBootstrap?.();
  if (bootstrap && standaloneModule === 'simulator') applySimulatorBootstrap(bootstrap);
  $('#backendState').textContent = '连接中';
  bindEvents();
  const isStandalone = ['terminal', 'trend', 'rules', 'macros', 'simulator', 'serial-config'].includes(standaloneModule);
  if (isStandalone) {
    document.body.classList.add('standalone-module');
    if (standaloneModule === 'serial-config') document.body.classList.add('serial-config-window');
  }
  restoreLayout();
  if (isStandalone) switchPage(`page-${standaloneModule}`);
  loadSavedRules();
  loadSampleRules();
  renderRules();
  renderSampleRules();
  renderMacros();
  renderSimulator();
  initAiPanel();
  restoreProfile();
  restoreSerialDraft();
  updateFramingUi();
  connectBackend();
  window.serialScope.onBackendLog((message) => addSystemLog(message.trim()));
  window.serialScope.onBackendExit(() => {
    state.connected = false;
    updateConnectionUi('Native C++ 后端已退出');
    scheduleReconnect();
  });
  window.serialScope.onBackendRpcNotification(({ method, params }) => {
    handleMessage({ type: method.replaceAll('.', ':'), payload: params });
  });
  window.serialScope.onSimulatorOwnership?.(({ active }) => {
    state.simulatorOwner = Boolean(active);
    updateSimulatorStatus();
  });
  window.serialScope.onSimulatorBootstrap?.((config) => {
    applySimulatorBootstrap(config);
  });
  window.serialScope.onUiAction?.(handleUiAction);
  window.addEventListener('storage', (event) => {
    if (event.key === 'serialscope.simulator') {
      simulator = loadSimulator();
      renderSimulator();
    }
    if (event.key === 'serialscope.serial-draft') restoreSerialDraft();
  });
  window.setInterval(updateRateMetrics, 1000);
  requestAnimationFrame(drawRateChart);
  requestAnimationFrame(drawSampleChart);
}

async function connectBackend() {
  clearReconnectTimer();
  try {
    const started = await window.serialScope.startBackend();
    if (!started.started) throw new Error(started.message || 'Native C++ 后端无法启动');
    const [ports, serialState] = await Promise.all([
      window.serialScope.callBackend('ports.list', {}),
      window.serialScope.callBackend('serial.status', {})
    ]);
    state.connected = true;
    state.reconnectAttempts = 0;
    updateConnectionUi('后端已连接');
    handleMessage({ type: 'ports:list', payload: ports });
    handleMessage({ type: 'serial:state', payload: serialState });
    autoOpenSimulatorPort();
  } catch (error) {
    state.connected = false;
    state.serialOpen = false;
    updateConnectionUi(`后端未连接：${error.message}`);
    scheduleReconnect();
  }
}

async function autoOpenSimulatorPort() {
  if (standaloneModule !== 'simulator' || !state.connected || !simulatorBootstrapConfig?.serial?.portName || simulatorBootstrapConfig.autoOpened) return;
  simulatorBootstrapConfig.autoOpened = true;
  const port = simulatorBootstrapConfig.serial;
  const config = {
    portName: port.portName,
    baudRate: Number(port.baudRate || 9600),
    dataBits: Number(port.dataBits || 8),
    parity: port.parity || 'none',
    stopBits: port.stopBits || '1',
    flowControl: port.flowControl || 'none',
    framing: port.framing || { mode: 'raw' }
  };
  try {
    await window.serialScope.validateSimulatorAutoPort(config.portName);
    state.simulatorAutoPortVerified = true;
    const openResult = await sendCommand('serial:open', config);
    if (openResult?.ok === false || openResult?.isOpen === false) {
      throw new Error(openResult?.message || `无法打开 ${config.portName}`);
    }
    addSystemLog(`模拟下位机已自动打开 ${config.portName}`);
    await window.serialScope.reportSimulatorReady({ ok: true, message: `${config.portName} 已打开` });
  } catch (error) {
    simulatorBootstrapConfig.autoOpened = false;
    state.simulatorAutoPortVerified = false;
    addSystemLog(`模拟下位机自动打开失败：${error.message}`);
    await window.serialScope.reportSimulatorReady({ ok: false, message: error.message }).catch(() => {});
  }
}

function applySimulatorBootstrap(config) {
  if (standaloneModule !== 'simulator' || !config || typeof config !== 'object') return;
  simulator = normalizeSimulator(config);
  localStorage.setItem('serialscope.simulator', JSON.stringify(simulator));
  simulatorBootstrapConfig = { ...config, autoOpened: false };
  state.simulatorAutoPortVerified = false;
  renderSimulator();
  addSystemLog('已从通信测试工作台接收模拟下位机配置');
  autoOpenSimulatorPort();
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (state.reconnectTimer || state.connected) {
    return;
  }
  const delay = Math.min(8000, 600 * (2 ** state.reconnectAttempts));
  state.reconnectAttempts += 1;
  scheduleConnection(delay);
}

function scheduleConnection(delay) {
  clearReconnectTimer();
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectBackend();
  }, delay);
}

function sendCommand(type, payload = {}) {
  if (!state.connected) {
    showToast('Native C++ 后端未连接');
    return Promise.resolve({ ok: false, message: 'Native C++ 后端未连接' });
  }
  const method = type.replace(':', '.');
  return window.serialScope.callBackend(method, payload)
    .then((result) => {
      handleMessage({ type: type === 'ports:list' ? type : `${type}:result`, payload: result });
      return result;
    })
    .catch((error) => {
      addSystemLog(`后端调用失败：${error.message}`);
      showToast(error.message || '后端调用失败');
      return { ok: false, message: error.message || '后端调用失败' };
    });
}

function handleMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    addSystemLog('后端消息格式无效');
    return;
  }
  const payload = message.payload || {};
  if (message.type === 'backend:hello' || message.type === 'backend:ready') {
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
    if (message.type === 'serial:rx') {
      completeAutoQueryWithResponse(payload);
      queueSimulatorResponse(payload);
    }
    return;
  }
  if (message.type === 'backend:backpressure') {
    const dropped = Number(payload.droppedMessages || 0);
    const messageText = payload.message || '后端丢弃了部分实时事件';
    addSystemLog(`${messageText}（${dropped} 条）`);
    showToast(messageText);
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
  const startButton = $('#startBackendButton');
  if (startButton) startButton.disabled = state.connected;
}

function switchPage(pageId) {
  if (pageId === 'page-serial-config' && standaloneModule !== 'serial-config') {
    openSerialConfiguration();
    return;
  }
  const page = $(`#${pageId}`);
  if (!page) {
    return;
  }

  state.layout.activePage = pageId;
  $$('.page').forEach((item) => item.classList.toggle('active', item.id === pageId));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.pageTarget === pageId));
  $('#pageTitle').textContent = page.dataset.pageTitle || 'SerialScope';
  $('#pageEyebrow').textContent = page.dataset.pageEyebrow || '';
  if (!standaloneModule) persistLayout();
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

  if (!standaloneModule && state.layout.activePage === 'page-serial-config') {
    state.layout.activePage = 'page-terminal';
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
  state.metrics.rxBytes = finiteNumberOr(payload.rxBytes, state.metrics.rxBytes);
  state.metrics.txBytes = finiteNumberOr(payload.txBytes, state.metrics.txBytes);
  state.metrics.rxFrames = finiteNumberOr(payload.rxFrames, state.metrics.rxFrames);
  state.metrics.txFrames = finiteNumberOr(payload.txFrames, state.metrics.txFrames);

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
  $('#configSerialState').textContent = state.serialOpen ? `${payload.portName} 已打开` : '请配置后打开';
  if (!state.serialOpen && $('#autoSendCheck').checked) {
    stopAutoQuery();
    updateAutoSendStatus('自动查询已暂停：串口未打开（在途 0）');
  } else if (state.serialOpen && $('#autoSendCheck').checked && !state.autoQuery.inFlight && !state.autoQuery.timer) {
    scheduleAutoQuery(0);
  }
}

function finiteNumberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function renderPorts() {
  const select = $('#portSelect');
  let draftPort = '';
  try { draftPort = JSON.parse(localStorage.getItem('serialscope.serial-draft'))?.portName || ''; } catch { /* ignored */ }
  const current = select.value || draftPort;
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
    flowControl: $('#flowControlSelect').value,
    framing: {
      mode: $('#frameModeSelect').value,
      delimiter: currentFrameDelimiter(),
      frameSize: Number($('#frameSizeInput').value)
    }
  };
}

function restoreSerialDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('serialscope.serial-draft'));
    if (!draft || typeof draft !== 'object') return;
    $('#portSelect').value = draft.portName || $('#portSelect').value;
    $('#baudRateSelect').value = String(draft.baudRate || $('#baudRateSelect').value);
    $('#dataBitsSelect').value = String(draft.dataBits || $('#dataBitsSelect').value);
    $('#paritySelect').value = draft.parity || $('#paritySelect').value;
    $('#stopBitsSelect').value = draft.stopBits || $('#stopBitsSelect').value;
    $('#flowControlSelect').value = draft.flowControl || $('#flowControlSelect').value;
    $('#frameModeSelect').value = draft.framing?.mode || $('#frameModeSelect').value;
    applyFrameDelimiter(draft.framing?.delimiter || currentFrameDelimiter());
    $('#frameSizeInput').value = Number(draft.framing?.frameSize || $('#frameSizeInput').value);
    updateFramingUi();
  } catch {
    addSystemLog('串口配置草稿损坏，已忽略');
  }
}

function persistSerialDraft() {
  localStorage.setItem('serialscope.serial-draft', JSON.stringify(serialConfig()));
}

function updateFramingUi() {
  const enabled = $('#frameModeSelect').value === 'delimiter';
  const fixed = $('#frameModeSelect').value === 'fixed';
  const delimiter = $('#frameDelimiterSelect');
  delimiter.disabled = !enabled;
  const custom = delimiter.value === 'custom';
  $('#frameDelimiterHexField').hidden = !enabled || !custom;
  $('#frameDelimiterHexInput').disabled = !enabled || !custom;
  $('#frameSizeField').hidden = !fixed;
  $('#frameSizeInput').disabled = !fixed;
}

function currentFrameDelimiter() {
  const value = $('#frameDelimiterSelect').value;
  return value === 'custom' ? `HEX:${$('#frameDelimiterHexInput').value.trim()}` : value;
}

function applyFrameDelimiter(value) {
  const delimiter = String(value || 'LF');
  const select = $('#frameDelimiterSelect');
  if (Array.from(select.options).some((option) => option.value === delimiter)) {
    select.value = delimiter;
  } else if (delimiter.startsWith('HEX:')) {
    select.value = 'custom';
    $('#frameDelimiterHexInput').value = delimiter.slice(4);
  } else {
    select.value = 'LF';
  }
}

function currentSendPayload() {
  return {
    mode: $('#sendModeSelect').value,
    data: $('#sendInput').value,
    lineEnding: $('#lineEndingSelect').value,
    appendModbusCrc: $('#crcCheck').checked
  };
}

function sendCurrentInput() {
  if ($('#autoSendCheck').checked && state.autoQuery.inFlight) {
    showToast('自动查询正在等待应答；请先停止自动发送再手动发送');
    return Promise.resolve({ ok: false, message: '自动查询在途' });
  }
  return sendCommand('serial:send', currentSendPayload());
}

function addTransferLog(payload) {
  if ($('#pauseReceiveCheck').checked && payload.direction === 'rx') {
    state.pausedLogs.push(payload);
    state.pausedLogs = state.pausedLogs.slice(-1000);
    return;
  }

  const matchedRules = matchRules(payload.text || '', payload.hex || '');
  const row = {
    sequence: ++state.logSequence,
    time: formatLogTime(payload.timestamp),
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
  if (row.direction === 'rx' && !$('#samplePauseCheck').checked) {
    extractSamples(row);
  }
  updateInspector(row);
  scheduleLogRender();
}

function addSystemLog(text) {
  if (!text) {
    return;
  }
  state.logs.push({
    sequence: ++state.logSequence,
    time: formatLogTime(),
    direction: 'sys',
    bytes: 0,
    text,
    hex: '',
    hit: false,
    rules: []
  });
  scheduleLogRender();
}

function scheduleLogRender() {
  if (state.logRenderScheduled) {
    return;
  }
  state.logRenderScheduled = true;
  requestAnimationFrame(() => {
    state.logRenderScheduled = false;
    renderLog();
  });
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
  setText('#ruleHits', state.metrics.ruleHits);
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
  if (macros.length === 0) {
    selectedMacroIndex = -1;
  } else if (selectedMacroIndex < 0 || selectedMacroIndex >= macros.length) {
    selectedMacroIndex = 0;
  }
  $('#macroGrid').innerHTML = macros.map((macro, index) => `
    <article class="macro-card ${index === selectedMacroIndex ? 'selected' : ''}">
      <button class="macro-button" data-index="${index}" type="button">
        <strong>${escapeHtml(macro.name)}</strong>
        <span>${escapeHtml(macro.mode.toUpperCase())} · ${escapeHtml(macro.data)}</span>
      </button>
      <button class="macro-edit-button" data-edit-macro="${index}" type="button">编辑</button>
    </article>
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
  $$('[data-edit-macro]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedMacroIndex = Number(button.dataset.editMacro);
      renderMacros();
    });
  });
  renderMacroEditor();
}

function loadMacros() {
  try {
    return JSON.parse(localStorage.getItem('serialscope.macros')) || defaultMacros;
  } catch {
    return defaultMacros;
  }
}

function saveMacros(macros) {
  localStorage.setItem('serialscope.macros', JSON.stringify(macros));
  renderMacros();
}

function renderMacroEditor() {
  const macros = loadMacros();
  const macro = macros[selectedMacroIndex];
  const controls = ['#macroNameInput', '#macroModeSelect', '#macroDataInput', '#macroLineEndingSelect', '#macroCrcCheck', '#saveMacroButton', '#deleteMacroButton'];
  const enabled = Boolean(macro);
  controls.forEach((selector) => { $(selector).disabled = !enabled; });
  if (!macro) {
    $('#macroEditorHint').textContent = '暂无宏，请新建';
    $('#macroNameInput').value = '';
    $('#macroDataInput').value = '';
    return;
  }
  $('#macroEditorHint').textContent = `正在编辑：${macro.name}`;
  $('#macroNameInput').value = macro.name;
  $('#macroModeSelect').value = macro.mode || 'text';
  $('#macroDataInput').value = macro.data || '';
  $('#macroLineEndingSelect').value = macro.lineEnding || 'none';
  $('#macroCrcCheck').checked = Boolean(macro.appendModbusCrc);
}

function newMacro() {
  const macros = loadMacros();
  macros.push({ name: '新宏', mode: 'text', data: '', lineEnding: 'none', appendModbusCrc: false });
  selectedMacroIndex = macros.length - 1;
  saveMacros(macros);
  $('#macroNameInput').focus();
}

function saveMacroEditor() {
  const macros = loadMacros();
  if (!macros[selectedMacroIndex]) return;
  const name = $('#macroNameInput').value.trim();
  const data = $('#macroDataInput').value;
  if (!name) {
    showToast('宏名称不能为空');
    return;
  }
  if (!data.trim()) {
    showToast('宏数据不能为空');
    return;
  }
  macros[selectedMacroIndex] = {
    name,
    mode: $('#macroModeSelect').value,
    data,
    lineEnding: $('#macroLineEndingSelect').value,
    appendModbusCrc: $('#macroCrcCheck').checked
  };
  saveMacros(macros);
  showToast(`宏“${name}”已保存`);
}

function deleteSelectedMacro() {
  const macros = loadMacros();
  if (!macros[selectedMacroIndex]) return;
  const name = macros[selectedMacroIndex].name;
  macros.splice(selectedMacroIndex, 1);
  selectedMacroIndex = Math.min(selectedMacroIndex, macros.length - 1);
  saveMacros(macros);
  showToast(`宏“${name}”已删除`);
}

function loadSimulator() {
  try {
    return normalizeSimulator(JSON.parse(localStorage.getItem('serialscope.simulator')));
  } catch {
    return { ...defaultSimulator, rules: [] };
  }
}

function normalizeSimulator(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: Boolean(source.enabled),
    builtIn: ['none', 'echo', 'at', 'modbus'].includes(source.builtIn) ? source.builtIn : 'none',
    delayMs: Math.max(0, Math.min(10000, Number(source.delayMs ?? 20) || 0)),
    rules: Array.isArray(source.rules) ? source.rules.map((rule) => ({
      enabled: rule?.enabled !== false,
      matchHex: String(rule?.matchHex || '*').trim().toUpperCase(),
      responseHex: String(rule?.responseHex || '').trim().toUpperCase()
    })).filter((rule) => rule.matchHex && rule.responseHex) : []
  };
}

function persistSimulator() {
  localStorage.setItem('serialscope.simulator', JSON.stringify(simulator));
}

function renderSimulator() {
  $('#simulatorEnabledCheck').checked = simulator.enabled;
  $('#simulatorBuiltinSelect').value = simulator.builtIn;
  $('#simulatorDelayInput').value = simulator.delayMs;
  renderSimulatorRules();
  updateSimulatorStatus();
}

function renderSimulatorRules() {
  const container = $('#simulatorRuleList');
  container.innerHTML = simulator.rules.length ? simulator.rules.map((rule, index) => `
    <article class="simulator-rule-row" data-simulator-rule="${index}">
      <label><span>收到 HEX</span><input class="simulator-match" value="${escapeAttribute(rule.matchHex)}" placeholder="01 03 00 00 00 01 或 *" /></label>
      <label><span>回复 HEX</span><input class="simulator-response" value="${escapeAttribute(rule.responseHex)}" placeholder="01 03 {{RAND8}}" /></label>
      <button class="danger-button simulator-rule-delete" type="button">删除</button>
    </article>
  `).join('') : '<p class="empty-state">还没有自定义规则。内置规约仍可独立使用。</p>';
  $$('.simulator-rule-delete').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.closest('[data-simulator-rule]').dataset.simulatorRule);
    simulator.rules.splice(index, 1);
    renderSimulatorRules();
  }));
}

function addSimulatorRule() {
  simulator.rules.push({ enabled: true, matchHex: '*', responseHex: '{{RAND8}}' });
  renderSimulatorRules();
}

function saveSimulatorEditor() {
  const rules = [];
  for (const row of $$('[data-simulator-rule]')) {
    const matchHex = row.querySelector('.simulator-match').value.trim().toUpperCase();
    const responseHex = row.querySelector('.simulator-response').value.trim().toUpperCase();
    if (!matchHex || !responseHex) {
      showToast('自定义规则的收发报文不能为空');
      return;
    }
    const compactMatch = normalizeHex(matchHex);
    if (matchHex !== '*' && (!/^[0-9A-F]+$/.test(compactMatch) || compactMatch.length % 2 !== 0)) {
      showToast('收到 HEX 必须是完整十六进制字节，或使用 *');
      return;
    }
    try {
      expandRandomHexTemplate(responseHex);
    } catch (error) {
      showToast(`规则回复无效：${error.message}`);
      return;
    }
    rules.push({ enabled: true, matchHex, responseHex });
  }
  simulator = normalizeSimulator({
    enabled: $('#simulatorEnabledCheck').checked,
    builtIn: $('#simulatorBuiltinSelect').value,
    delayMs: $('#simulatorDelayInput').value,
    rules
  });
  persistSimulator();
  renderSimulator();
  showToast('模拟下位机配置已保存');
}

function updateSimulatorStatus() {
  const enabled = $('#simulatorEnabledCheck').checked;
  const builtIn = $('#simulatorBuiltinSelect').value;
  const ownerText = state.simulatorOwner ? '本窗口应答' : '由独立模拟窗口应答';
  $('#simulatorStatus').textContent = enabled
    ? `已启用：${builtIn === 'none' ? '仅自定义规则' : builtIn.toUpperCase()}，${simulator.rules.length} 条自定义规则，${ownerText}`
    : '模拟下位机未启用';
}

function queueSimulatorResponse(payload) {
  if (!state.simulatorOwner || !simulator.enabled || !state.connected || !state.serialOpen) return;
  if (simulatorBootstrapConfig?.serial && !state.simulatorAutoPortVerified) return;
  const incoming = state.simulatorReceiveBuffer;
  incoming.hex += normalizeHex(payload.hex || '');
  incoming.text += String(payload.text || '');
  if (incoming.hex.length > 131072 || incoming.text.length > 65536) {
    resetSimulatorReceiveBuffer();
    window.serialScope.reportSimulatorActivity?.({ phase: 'dropped', detail: '原始接收聚合超过 64 KiB 上限' });
    addSystemLog('模拟下位机接收聚合超过 64 KiB，已丢弃未完成报文');
    return;
  }
  window.serialScope.reportSimulatorActivity?.({ phase: 'received', detail: String(payload.hex || '').slice(0, 1024) });
  if (!incoming.deadlineTimer) incoming.deadlineTimer = window.setTimeout(flushSimulatorResponse, 24);
  if (incoming.timer) window.clearTimeout(incoming.timer);
  // 原始读取块不等同于规约报文。以短暂的空闲窗口合并连续块，避免 Modbus/自定义
  // 规则只看到半帧；确定性分帧模式仍由后端负责先行聚合。
  incoming.timer = window.setTimeout(flushSimulatorResponse, 8);
}

function flushSimulatorResponse() {
  const incoming = state.simulatorReceiveBuffer;
  if (incoming.timer) window.clearTimeout(incoming.timer);
  if (incoming.deadlineTimer) window.clearTimeout(incoming.deadlineTimer);
  incoming.timer = null;
  incoming.deadlineTimer = null;
  const incomingHex = incoming.hex;
  const incomingText = incoming.text;
  incoming.hex = '';
  incoming.text = '';
  if (!incomingHex && !incomingText) return;
  const response = simulatorResponseFor(incomingHex, incomingText);
  if (!response) return;
  window.serialScope.reportSimulatorActivity?.({ phase: 'matched', detail: response.description || '规则匹配' });
  state.simulatorSendChain = state.simulatorSendChain
    .then(() => new Promise((resolve) => window.setTimeout(resolve, simulator.delayMs)))
    .then(async () => {
      const result = await window.serialScope.callBackend('serial.send', {
        mode: response.mode,
        data: response.data,
        lineEnding: response.lineEnding || 'none',
        appendModbusCrc: false
      });
      if (!result.ok) throw new Error(result.message || '模拟回复发送失败');
      window.serialScope.reportSimulatorActivity?.({ phase: 'responded', detail: response.data.slice(0, 1024) });
      addSystemLog(`模拟下位机已回复：${response.description}`);
    })
    .catch((error) => {
      window.serialScope.reportSimulatorActivity?.({ phase: 'send-failed', detail: error.message });
      addSystemLog(`模拟下位机回复失败：${error.message}`);
      showToast(error.message || '模拟下位机回复失败');
    });
}

function resetSimulatorReceiveBuffer() {
  const incoming = state.simulatorReceiveBuffer;
  if (incoming.timer) window.clearTimeout(incoming.timer);
  if (incoming.deadlineTimer) window.clearTimeout(incoming.deadlineTimer);
  incoming.hex = '';
  incoming.text = '';
  incoming.timer = null;
  incoming.deadlineTimer = null;
}

function simulatorResponseFor(incomingHex, incomingText) {
  const normalized = normalizeHex(incomingHex);
  for (const rule of simulator.rules) {
    if (rule.enabled && (rule.matchHex === '*' || normalizeHex(rule.matchHex) === normalized)) {
      return { mode: 'hex', data: expandRandomHexTemplate(rule.responseHex), description: `自定义规则 ${rule.matchHex}` };
    }
  }
  if (simulator.builtIn === 'echo' && normalized) {
    return { mode: 'hex', data: normalized, description: 'Echo' };
  }
  if (simulator.builtIn === 'at') {
    const command = incomingText.trim().toUpperCase();
    if (!command.startsWith('AT')) return null;
    return { mode: 'text', data: command === 'AT+GMR' ? 'SerialScope Simulator\r\nOK' : 'OK', lineEnding: 'CRLF', description: 'AT 命令' };
  }
  if (simulator.builtIn === 'modbus') {
    const response = modbusSimulatorResponse(normalized);
    return response ? { mode: 'hex', data: response, description: 'Modbus RTU' } : null;
  }
  return null;
}

function normalizeHex(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function expandRandomHexTemplate(template) {
  let expanded = String(template || '').toUpperCase()
    .replace(/\{\{RAND8\}\}/g, () => randomHexByte())
    .replace(/\{\{RAND16LE\}\}/g, () => `${randomHexByte()}${randomHexByte()}`)
    .replace(/\{\{RAND16BE\}\}/g, () => `${randomHexByte()}${randomHexByte()}`)
    .replace(/\{\{RANDHEX:(\d+)\}\}/g, (_all, length) => {
      const count = Number(length);
      if (!Number.isInteger(count) || count < 1 || count > 1024) throw new Error('RANDHEX 长度必须在 1 到 1024 之间');
      return Array.from({ length: count }, randomHexByte).join('');
    });
  expanded = normalizeHex(expanded);
  if (!expanded || !/^[0-9A-F]+$/.test(expanded) || expanded.length % 2 !== 0) {
    throw new Error('回复必须是十六进制字节或受支持的随机占位符');
  }
  return expanded.match(/.{2}/g).join(' ');
}

function randomHexByte() {
  const byte = new Uint8Array(1);
  crypto.getRandomValues(byte);
  return byte[0].toString(16).padStart(2, '0').toUpperCase();
}

function modbusSimulatorResponse(hex) {
  const compact = normalizeHex(hex);
  if (!/^[0-9A-F]+$/.test(compact) || compact.length < 12 || compact.length % 2 !== 0) return null;
  const bytes = compact.match(/.{2}/g).map((value) => Number.parseInt(value, 16));
  const unit = bytes[0];
  const functionCode = bytes[1];
  if ((functionCode === 0x03 || functionCode === 0x04) && bytes.length >= 6) {
    const quantity = (bytes[4] << 8) | bytes[5];
    if (quantity < 1 || quantity > 125) return null;
    const data = Array.from({ length: quantity * 2 }, () => randomHexByte()).join('');
    return appendModbusCrcToHex(`${unit.toString(16).padStart(2, '0')}${functionCode.toString(16).padStart(2, '0')}${(quantity * 2).toString(16).padStart(2, '0')}${data}`);
  }
  if ((functionCode === 0x06 || functionCode === 0x10) && bytes.length >= 6) {
    return appendModbusCrcToHex(bytes.slice(0, 6).map((value) => value.toString(16).padStart(2, '0')).join(''));
  }
  return null;
}

function appendModbusCrcToHex(hex) {
  const bytes = hex.match(/.{2}/g).map((value) => Number.parseInt(value, 16));
  let crc = 0xFFFF;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
  }
  return [...bytes, crc & 0xFF, (crc >>> 8) & 0xFF].map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
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
    autoSendTimeout: Number($('#autoSendTimeout').value || 500),
    viewMode: state.viewMode,
    rules: rules.map(ruleToProfile),
    sampleRules: sampleRules.map(sampleRuleToProfile),
    macros: loadMacros(),
    simulator
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
    $('#frameModeSelect').value = profile.serial.framing?.mode || 'raw';
    applyFrameDelimiter(profile.serial.framing?.delimiter || 'LF');
    $('#frameSizeInput').value = Number(profile.serial.framing?.frameSize || 8);
    updateFramingUi();
    persistSerialDraft();
  }
  $('#sendModeSelect').value = profile.sendMode || 'text';
  $('#sendModeLabel').textContent = $('#sendModeSelect').value.toUpperCase();
  if (typeof profile.sendText === 'string') {
    $('#sendInput').value = profile.sendText;
  }
  $('#lineEndingSelect').value = profile.lineEnding || 'CRLF';
  $('#crcCheck').checked = Boolean(profile.appendCrc);
  $('#autoSendInterval').value = Number(profile.autoSendInterval || 1000);
  $('#autoSendTimeout').value = Number(profile.autoSendTimeout || 500);
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
  if (profile.simulator) {
    simulator = normalizeSimulator(profile.simulator);
    persistSimulator();
    renderSimulator();
  }
}

function restoreProfile() {
  const raw = localStorage.getItem('serialscope.profile');
  if (!raw) {
    return;
  }
  try {
    applyProfile(JSON.parse(raw));
  } catch {
    addSystemLog('本地配置损坏，已忽略；可重新保存配置');
  }
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
}

function drawRateChart() {
  const canvas = $('#rateCanvas');
  if (!canvas || canvas.offsetParent === null) {
    window.setTimeout(() => requestAnimationFrame(drawRateChart), 500);
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
  window.setTimeout(() => requestAnimationFrame(drawRateChart), 100);
}

function drawSampleChart() {
  const canvas = $('#sampleCanvas');
  if (!canvas || canvas.offsetParent === null) {
    window.setTimeout(() => requestAnimationFrame(drawSampleChart), 500);
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
    window.setTimeout(() => requestAnimationFrame(drawSampleChart), 100);
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

  window.setTimeout(() => requestAnimationFrame(drawSampleChart), 100);
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
  $$('[data-open-module]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.serialScope.openModuleWindow(button.dataset.openModule);
      } catch (error) {
        showToast(error.message || '无法打开独立窗口');
      }
    });
  });
  $('#refreshConfigPortsButton').addEventListener('click', () => sendCommand('ports:list'));
  $('#openButton').addEventListener('click', () => {
    persistSerialDraft();
    sendCommand('serial:open', serialConfig());
  });
  $('#closeButton').addEventListener('click', () => sendCommand('serial:close'));
  $('#sendButton').addEventListener('click', sendCurrentInput);
  $('#newMacroButton').addEventListener('click', newMacro);
  $('#saveMacroButton').addEventListener('click', saveMacroEditor);
  $('#deleteMacroButton').addEventListener('click', deleteSelectedMacro);
  $('#addSimulatorRuleButton').addEventListener('click', addSimulatorRule);
  $('#saveSimulatorButton').addEventListener('click', saveSimulatorEditor);
  $('#simulatorEnabledCheck').addEventListener('change', updateSimulatorStatus);
  $('#simulatorBuiltinSelect').addEventListener('change', updateSimulatorStatus);
  $('#simulatorDelayInput').addEventListener('change', updateSimulatorStatus);
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
  $('#frameModeSelect').addEventListener('change', updateFramingUi);
  $('#frameDelimiterSelect').addEventListener('change', updateFramingUi);
  ['#portSelect', '#baudRateSelect', '#dataBitsSelect', '#paritySelect', '#stopBitsSelect', '#flowControlSelect', '#frameModeSelect', '#frameDelimiterSelect', '#frameDelimiterHexInput', '#frameSizeInput']
    .forEach((selector) => $(selector).addEventListener('change', persistSerialDraft));
  $('#autoSendCheck').addEventListener('change', updateAutoSend);
  $('#autoSendInterval').addEventListener('change', updateAutoSend);
  $('#autoSendTimeout').addEventListener('change', updateAutoSend);
  $('#pauseReceiveCheck').addEventListener('change', flushPausedLogs);
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

async function startBackendFromUi() {
  const result = await window.serialScope.startBackend();
  showToast(result.message);
  scheduleConnection(500);
}

function handleUiAction(detail) {
  const action = detail?.action;
  const payload = detail?.payload || {};
  if (action === 'navigate') return switchPage(payload.pageId);
  if (action === 'start-backend') return startBackendFromUi();
  if (action === 'refresh-ports') return sendCommand('ports:list');
  if (action === 'open-serial') return openSerialConfiguration();
  if (action === 'close-serial') return sendCommand('serial:close');
  if (action === 'send-current') return sendCurrentInput();
  if (action === 'save-profile') return saveProfile();
  if (action === 'load-profile') return loadProfileFile();
  if (action === 'export-log') return exportLog();
  if (action === 'export-samples') return exportSamples();
  if (action === 'reset-layout') return resetLayout();
  if (action === 'edit-rules') return openRuleConfig();
  if (action === 'about') return showToast('SerialScope Native · Named Pipe + JSON-RPC');
  if (action === 'mcp-started') return handleMcpAction('启动', payload);
  if (action === 'mcp-stopped') return handleMcpAction('停止', payload);
  if (action === 'mcp-configure') return configureMcpPorts();
}

// ---- MCP Server 状态与配置 ----
async function handleMcpAction(verb, payload) {
  const message = payload?.message || '';
  showToast(`MCP Server ${verb}：${message}`);
  await refreshMcpStatus();
}

async function refreshMcpStatus() {
  try {
    const status = await window.serialScope.getMcpStatus();
    const state = status.running ? 'MCP 运行中' : 'MCP 未启动';
    const ports = (status.allowPorts || []).join(', ') || '(无)';
    showToast(`${state}｜白名单端口：${ports}`);
  } catch (error) {
    showToast(error.message || '无法获取 MCP 状态');
  }
}

async function configureMcpPorts() {
  try {
    const status = await window.serialScope.getMcpStatus();
    const current = (status.allowPorts || []).join(', ');
    const input = window.prompt('MCP 端口白名单（逗号分隔，仅这些端口可被 MCP 操控）：', current);
    if (input === null) return;
    const ports = input.split(/[,，\s]+/).filter(Boolean);
    const result = await window.serialScope.setMcpPorts(ports);
    showToast(`MCP 端口白名单已更新：${(result.allowPorts || []).join(', ') || '(空)'}`);
  } catch (error) {
    showToast(error.message || '配置 MCP 端口白名单失败');
  }
}

// ---- AI 规约解析（page-protocol）----
function protocolStorageKey() { return 'serialscope.protocol'; }

function loadSavedProtocol() {
  try {
    return JSON.parse(localStorage.getItem(protocolStorageKey())) || null;
  } catch {
    return null;
  }
}

function persistProtocol(saved) {
  localStorage.setItem(protocolStorageKey(), JSON.stringify(saved));
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function bytesToHexLabel(bytes) {
  if (!Array.isArray(bytes) || bytes.length === 0) return '(空)';
  return bytes.map((b) => `0x${Number(b).toString(16).toUpperCase().padStart(2, '0')}`).join(' ');
}

async function refreshAiStatus() {
  try {
    let status = {};
    try {
      status = await window.serialScope.callBackend('ai.status');
    } catch {
      status = {};
    }
    // 真实 provider 配置在 Main 侧（ai:config），优先用其判断 enabled/provider/upload，显示与调用分发一致。
    let cfg = null;
    try {
      cfg = await window.serialScope.getAiConfig();
    } catch {
      cfg = null;
    }
    const providerLabel = cfg?.provider || status.provider || 'mock';
    // enabled：Main 侧 ai:config 或后端 ai.status 任一启用即视为启用（两套状态可能来自不同配置入口）。
    const enabled = Boolean(cfg?.enabled || status.enabled);
    const allowDataUpload = Boolean(cfg?.allowDataUpload || status.allowDataUpload);
    state.ai.enabled = enabled;
    state.ai.allowDataUpload = allowDataUpload;
    const keyInfo = cfg ? (cfg.hasApiKey ? `｜Key 来源 ${cfg.keySource}` : '｜无 Key（将回退 mock）') : '';
    const label = $('#aiStatusLabel');
    label.textContent = enabled
      ? `AI 已启用（provider: ${providerLabel}，上传: ${allowDataUpload ? '允许' : '禁止'}${keyInfo}）`
      : 'AI 未启用';
    $('#aiEnableButton').textContent = enabled ? 'AI 已启用' : '启用 AI';
    $('#aiParseButton').disabled = !enabled;
    $('#aiGenerateButton').disabled = !enabled;
  } catch (error) {
    showToast(error.message || '无法获取 AI 状态');
  }
}

async function enableAi() {
  try {
    const result = await window.serialScope.callBackend('ai.configure', { enabled: true });
    state.ai.enabled = Boolean(result.enabled);
    await refreshAiStatus();
    showToast('AI 已启用（本地 mock，不上传数据）');
  } catch (error) {
    showToast(error.message || '启用 AI 失败');
  }
}

async function parseProtocol() {
  const text = $('#protocolTextInput').value.trim();
  if (!text) {
    showToast('请先输入规约文本');
    return;
  }
  $('#aiParseButton').disabled = true;
  $('#aiParseButton').textContent = '解析中…';
  try {
    const result = await window.serialScope.callBackend('ai.parseProtocol', { text, includeSerialData: state.ai.includeSerialData });
    state.ai.protocol = {
      header: Array.isArray(result.header) ? result.header : [],
      lengthFieldOffset: result.lengthFieldOffset ?? 0,
      lengthFieldSize: result.lengthFieldSize ?? 0,
      fields: Array.isArray(result.fields) ? result.fields : [],
      source: result.source || 'mock'
    };
    renderProtocolResult();
  } catch (error) {
    showToast(error.message || '解析规约失败');
  } finally {
    $('#aiParseButton').textContent = '解析规约';
    if (state.ai.enabled) $('#aiParseButton').disabled = false;
  }
}

function renderProtocolResult() {
  const container = $('#protocolParseResult');
  const p = state.ai.protocol;
  if (!p) {
    container.className = 'protocol-result empty';
    container.innerHTML = '尚未解析。点击“解析规约”查看 AI 提取的帧头、长度域与字段。';
    return;
  }
  container.className = 'protocol-result';
  const rows = p.fields.map((field, index) => `
    <div class="protocol-field-row" data-index="${index}">
      <label>名称<input class="pf-name" type="text" value="${escapeHtml(field.name)}" /></label>
      <label>偏移<input class="pf-offset" type="number" min="0" value="${Number(field.offset) || 0}" /></label>
      <label>字节数<input class="pf-size" type="number" min="0" value="${Number(field.size) || 0}" /></label>
    </div>`).join('');
  container.innerHTML = `
    <p class="protocol-summary">帧头：<strong>${escapeHtml(bytesToHexLabel(p.header))}</strong>　长度域偏移：<strong>${p.lengthFieldOffset}</strong>　长度域字节数：<strong>${p.lengthFieldSize}</strong></p>
    <p>字段表（可编辑）：</p>
    ${rows || '<p class="empty">（无字段）</p>'}
    <div class="button-row">
      <button id="saveProtocolButtonInner" class="primary-button" type="button">保存校正结果</button>
      <button id="exportProtocolButton" class="text-button" type="button">导出 JSON</button>
    </div>`;
  $('#saveProtocolButtonInner').addEventListener('click', saveProtocolCorrections);
  $('#exportProtocolButton').addEventListener('click', exportProtocolJson);
}

function saveProtocolCorrections() {
  const p = state.ai.protocol;
  if (!p) return;
  const fields = [];
  document.querySelectorAll('#protocolParseResult .protocol-field-row').forEach((row) => {
    fields.push({
      name: row.querySelector('.pf-name').value.trim(),
      offset: Number(row.querySelector('.pf-offset').value) || 0,
      size: Number(row.querySelector('.pf-size').value) || 0
    });
  });
  p.fields = fields;
  persistProtocol(p);
  showToast('校正结果已保存到本地配置');
}

async function exportProtocolJson() {
  const p = state.ai.protocol;
  if (!p) return;
  const label = (p.header || []).map((b) => Number(b).toString(16).padStart(2, '0')).join('') || 'protocol';
  await window.serialScope.saveTextFile({
    title: '导出规约配置',
    defaultPath: `protocol-${label}.json`,
    content: JSON.stringify(p, null, 2)
  });
}

function codeToHex(code) {
  if (!Array.isArray(code)) return '';
  return code.map((b) => Number(b).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

async function generateAiCommands() {
  const text = $('#protocolTextInput').value.trim();
  if (!text) {
    showToast('请先输入规约文本再生成命令');
    return;
  }
  $('#aiGenerateButton').disabled = true;
  $('#aiGenerateButton').textContent = '生成中…';
  try {
    const result = await window.serialScope.callBackend('ai.generateCommands', { text, includeSerialData: state.ai.includeSerialData });
    state.ai.generatedCommands = Array.isArray(result.commands) ? result.commands : [];
    state.ai.commandSource = result.source || 'mock';
    renderCommandResult();
    // 命令生成时自动保存到宏库（无需逐条手动点击）。
    const savedCount = saveGeneratedCommandsToMacros(state.ai.generatedCommands);
    if (savedCount > 0) {
      showToast(`已生成并保存 ${savedCount} 条命令到宏库`);
    }
  } catch (error) {
    showToast(error.message || '生成命令失败');
  } finally {
    $('#aiGenerateButton').textContent = '生成命令';
    if (state.ai.enabled) $('#aiGenerateButton').disabled = false;
  }
}

// 把生成的命令批量自动保存到宏库，返回实际保存条数。
function saveGeneratedCommandsToMacros(commands) {
  const macros = loadMacros();
  let saved = 0;
  (Array.isArray(commands) ? commands : []).forEach((command) => {
    const data = codeToHex(command.code);
    if (!data.trim()) return;
    const name = (command.name || 'AI 命令').trim();
    const existing = macros.find((macro) => macro.name === name);
    if (existing) {
      existing.mode = 'hex';
      existing.data = data;
      existing.lineEnding = 'none';
      existing.appendModbusCrc = false;
    } else {
      macros.push({ name, mode: 'hex', data, lineEnding: 'none', appendModbusCrc: false });
    }
    saved += 1;
  });
  if (saved > 0) saveMacros(macros);
  return saved;
}

function renderCommandResult() {
  const container = $('#commandGenerateResult');
  const commands = state.ai.generatedCommands || [];
  if (commands.length === 0) {
    container.className = 'command-result empty';
    container.innerHTML = '尚未生成。启用 AI 后点击“生成命令”，根据规约文本生成读写命令并加入宏库复用。';
    return;
  }
  container.className = 'command-result';
  container.innerHTML = commands.map((command, index) => `
    <div class="command-row" data-index="${index}">
      <div>
        <strong>${escapeHtml(command.name || '(未命名)')}</strong>
        <code>${escapeHtml(codeToHex(command.code))}</code>
        ${command.description ? `<small>${escapeHtml(command.description)}</small>` : ''}
      </div>
      <button class="primary-button" data-add-command="${index}" type="button">加入宏库</button>
    </div>`).join('');
  document.querySelectorAll('#commandGenerateResult [data-add-command]').forEach((button) => {
    button.addEventListener('click', () => {
      const command = commands[Number(button.dataset.addCommand)];
      if (command) addCommandToMacros(command);
    });
  });
}

function addCommandToMacros(command) {
  const saved = saveGeneratedCommandsToMacros([command]);
  if (saved === 0) {
    showToast('命令字节为空，无法加入宏库');
    return;
  }
  showToast(`命令“${command.name || 'AI 命令'}”已加入宏库`);
}

async function importProtocolDocument() {
  try {
    const result = await window.serialScope.importProtocolFile();
    if (!result.ok) {
      if (!result.canceled) showToast(result.message || '导入失败');
      return;
    }
    $('#protocolTextInput').value = result.text || '';
    showToast('规约文档已导入');
  } catch (error) {
    showToast(error.message || '导入文档失败');
  }
}

async function openAiConfig() {
  try {
    const snapshot = await window.serialScope.getAiConfig();
    $('#aiApiKeyInput').value = '';
    $('#aiIncludeSerialCheck').checked = Boolean(state.ai.includeSerialData);
    $('#aiTestResult').textContent = '';
    $('#aiTestResult').className = 'ai-test-result';
    $('#aiConfigModal').hidden = false;
  } catch (error) {
    showToast(error.message || '打开 AI 配置失败');
  }
}

function closeAiConfig() {
  $('#aiConfigModal').hidden = true;
}

async function testAiConnection() {
  const resultEl = $('#aiTestResult');
  resultEl.textContent = '测试中…';
  resultEl.className = 'ai-test-result testing';
  try {
    const result = await window.serialScope.testAiConnection();
    resultEl.textContent = `✅ 连接成功：${(result.reply || '').slice(0, 80)}`;
    resultEl.className = 'ai-test-result ok';
  } catch (error) {
    resultEl.textContent = `❌ 连接失败：${error.message || '未知错误'}`;
    resultEl.className = 'ai-test-result fail';
  }
}

async function saveAiConfig() {
  const apiKey = $('#aiApiKeyInput').value.trim();
  const includeSerial = $('#aiIncludeSerialCheck').checked;
  if (!apiKey) {
    showToast('请填写 DeepSeek API Key');
    return;
  }
  state.ai.includeSerialData = includeSerial;
  try {
    // 用户只提供 Key，其余用 DeepSeek 固定配置（provider=deepseek、enabled、允许上传）。
    const result = await window.serialScope.configureAi({
      provider: 'deepseek',
      enabled: true,
      allowDataUpload: true,
      apiKey
    });
    showToast(`DeepSeek 已配置并启用（Key 来源 ${result.keySource}）`);
    closeAiConfig();
    await refreshAiStatus();
  } catch (error) {
    showToast(error.message || '保存 DeepSeek 配置失败');
  }
}

function initAiPanel() {
  const saved = loadSavedProtocol();
  if (saved) {
    state.ai.protocol = saved;
    renderProtocolResult();
  }
  refreshAiStatus();
  $('#importProtocolButton').addEventListener('click', importProtocolDocument);
  $('#aiConfigButton').addEventListener('click', openAiConfig);
  $('#aiEnableButton').addEventListener('click', enableAi);
  $('#aiParseButton').addEventListener('click', parseProtocol);
  $('#aiGenerateButton').addEventListener('click', generateAiCommands);
  $('#saveProtocolButton').addEventListener('click', () => {
    if (state.ai.protocol) renderProtocolResult();
  });
  $('#testAiConnectionButton').addEventListener('click', testAiConnection);
  $('#saveAiConfigButton').addEventListener('click', saveAiConfig);
  $('#cancelAiConfigButton').addEventListener('click', closeAiConfig);
  $('#closeAiConfigModalButton').addEventListener('click', closeAiConfig);
}

async function openSerialConfiguration() {
  if (standaloneModule === 'serial-config') {
    persistSerialDraft();
    sendCommand('serial:open', serialConfig());
    return;
  }
  try {
    await window.serialScope.openModuleWindow('serial-config');
  } catch (error) {
    showToast(error.message || '无法打开串口配置窗口');
  }
}

function updateAutoSend() {
  stopAutoQuery();
  if (!$('#autoSendCheck').checked) {
    updateAutoSendStatus('自动查询已停止');
    return;
  }
  scheduleAutoQuery(0);
}

function autoQueryInterval() {
  return Math.max(10, Number($('#autoSendInterval').value || 1000));
}

function autoQueryTimeout() {
  return Math.max(10, Number($('#autoSendTimeout').value || 500));
}

function updateAutoSendStatus(message) {
  const status = $('#autoSendStatus');
  if (!status) return;
  status.dataset.inflight = state.autoQuery.inFlight ? '1' : '0';
  status.textContent = message;
}

function stopAutoQuery() {
  const query = state.autoQuery;
  if (query.timer) window.clearTimeout(query.timer);
  if (query.timeoutTimer) window.clearTimeout(query.timeoutTimer);
  query.timer = null;
  query.timeoutTimer = null;
  query.inFlight = false;
  query.activeToken = 0;
  query.sendSettled = false;
  query.responseReceived = false;
  query.timeoutObserved = false;
}

function scheduleAutoQuery(delay) {
  if (!$('#autoSendCheck').checked) return;
  if (!state.connected || !state.serialOpen) {
    updateAutoSendStatus('自动查询等待串口打开（在途 0）');
    return;
  }
  if (state.autoQuery.inFlight) return;
  state.autoQuery.timer = window.setTimeout(runAutoQuery, Math.max(0, delay));
  updateAutoSendStatus(`自动查询等待下一轮（在途 0，最小周期 ${autoQueryInterval()} ms）`);
}

async function runAutoQuery() {
  state.autoQuery.timer = null;
  if (!$('#autoSendCheck').checked || !state.connected || !state.serialOpen || state.autoQuery.inFlight) return;
  const query = state.autoQuery;
  const token = ++query.nextToken;
  query.activeToken = token;
  query.inFlight = true;
  query.sendSettled = false;
  query.responseReceived = false;
  query.timeoutObserved = false;
  query.sequence += 1;
  query.sent += 1;
  query.startedAt = performance.now();
  updateAutoSendStatus(`自动查询 #${query.sequence}：等待应答（在途 1）`);

  query.timeoutTimer = window.setTimeout(() => onAutoQueryTimeout(token), autoQueryTimeout());
  const result = await sendCommand('serial:send', currentSendPayload());
  if (!isActiveAutoQuery(token)) return;
  query.sendSettled = true;
  if (!result?.ok) {
    finishAutoQuery(token, '发送失败');
    return;
  }
  if (query.responseReceived) finishAutoQuery(token, '已收到应答');
  else if (query.timeoutObserved) finishAutoQuery(token, '应答超时');
}

function completeAutoQueryWithResponse() {
  const query = state.autoQuery;
  if (!$('#autoSendCheck').checked || !query.inFlight) return;
  const token = query.activeToken;
  if (!isActiveAutoQuery(token)) return;
  query.responses += 1;
  query.responseReceived = true;
  if (query.sendSettled) finishAutoQuery(token, '已收到应答');
  else updateAutoSendStatus(`自动查询 #${query.sequence}：已收到应答，等待发送确认（在途 1）`);
}

function isActiveAutoQuery(token) {
  return state.autoQuery.inFlight && state.autoQuery.activeToken === token;
}

function onAutoQueryTimeout(token) {
  const query = state.autoQuery;
  if (!isActiveAutoQuery(token) || query.responseReceived) return;
  query.timeoutTimer = null;
  query.timeouts += 1;
  query.timeoutObserved = true;
  addSystemLog(`自动查询 #${query.sequence} 应答超时（${autoQueryTimeout()} ms）`);
  if (query.sendSettled) finishAutoQuery(token, '应答超时');
  else updateAutoSendStatus(`自动查询 #${query.sequence}：应答超时，等待发送确认（在途 1）`);
}

function finishAutoQuery(token, reason) {
  const query = state.autoQuery;
  if (!isActiveAutoQuery(token)) return;
  if (query.timeoutTimer) window.clearTimeout(query.timeoutTimer);
  query.timeoutTimer = null;
  query.inFlight = false;
  query.activeToken = 0;
  query.sendSettled = false;
  query.responseReceived = false;
  query.timeoutObserved = false;
  const elapsed = Math.max(0, performance.now() - query.startedAt);
  updateAutoSendStatus(`自动查询 #${query.sequence}${reason}（在途 0，耗时 ${Math.round(elapsed)} ms）`);
  scheduleAutoQuery(Math.max(0, autoQueryInterval() - elapsed));
}

async function exportLog() {
  const lines = state.logs.map((row) => [row.sequence, row.time, row.direction, row.bytes, row.text, row.hex].map(csvCell).join(','));
  const content = `sequence,time,direction,bytes,text,hex\n${lines.join('\n')}`;
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
  setText('#ruleHits', '0');
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
  setText('#ruleHits', state.metrics.ruleHits);
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

function formatLogTime(timestamp) {
  const candidate = timestamp ? new Date(timestamp) : new Date();
  const date = Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
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
