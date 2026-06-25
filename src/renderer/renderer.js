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
    rateHistory: []
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
  loadSavedRules();
  renderRules();
  renderMacros();
  restoreProfile();
  connectWebSocket();
  window.serialScope.onBackendLog((message) => addSystemLog(message.trim()));
  window.serialScope.onBackendExit(() => {
    state.connected = false;
    updateConnectionUi('Qt 后端已退出');
  });
  window.setInterval(updateRateMetrics, 1000);
  requestAnimationFrame(drawRateChart);
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
    showToast('Qt 后端未连接');
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

function renderRules() {
  $('#ruleList').innerHTML = rules.map((rule, index) => `
    <label class="rule-item">
      <input class="rule-toggle" data-rule-index="${index}" type="checkbox" ${rule.enabled ? 'checked' : ''} />
      <span>${rule.name}</span>
      <strong>${rule.hits}</strong>
    </label>
  `).join('');

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
