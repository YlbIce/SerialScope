const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');
const { findRegisteredVirtualSimulatorPort } = require('../src/main/virtual-simulator-port');

const root = path.join(__dirname, '..');
const profile = path.join(root, 'artifacts', `workbench-dual-simulator-profile-${process.pid}`);
const simulatorProfile = path.join(root, 'artifacts', `workbench-dual-simulator-child-profile-${process.pid}`);
const rendererRoot = path.join(root, 'src', 'renderer-dist');
const backendExe = path.join(root, 'backend', 'bin', process.platform === 'win32' ? 'serialscope-backend.exe' : 'serialscope-backend');
let window;
let backend;
let backendProcess;
let simulator;
let simulatorOutput = '';
const simulatorProgress = [];
const simulatorActivity = [];

fs.rmSync(profile, { recursive: true, force: true });
fs.rmSync(simulatorProfile, { recursive: true, force: true });
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
protocol.registerSchemesAsPrivileged([{ scheme: 'serialscope', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, description, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(60);
  }
  throw new Error(`超时：${description}`);
}

async function startBackend() {
  if (!fs.existsSync(backendExe)) throw new Error(`后端不存在：${backendExe}`);
  const pipeName = `\\\\.\\pipe\\SerialScope.WorkbenchTest.${randomUUID()}`;
  backendProcess = spawn(backendExe, ['--pipe', pipeName], { cwd: path.dirname(backendExe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  backend = new NamedPipeRpcClient();
  backend.on('notification', (method, params) => {
    if (!window || window.isDestroyed()) return;
    window.webContents.send('backend:rpc-notification', { method, params });
  });
  await backend.connect(pipeName);
  await backend.call('backend.ping');
}

async function closeResources() {
  if (simulator && !simulator.killed) simulator.kill();
  simulator = null;
  if (backend) {
    await backend.call('serial.close').catch(() => {});
    backend.close();
    backend = null;
  }
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
  backendProcess = null;
}

function simulatorConfig() {
  return {
    enabled: true,
    builtIn: 'modbus',
    delayMs: 20,
    rules: [{ enabled: true, matchHex: '01 03 00 00 00 02 C4 0B', responseHex: '01 03 04 00 00 00 00 FA 33' }],
    serial: { portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } }
  };
}

async function launchSecondSimulator() {
  findRegisteredVirtualSimulatorPort(await backend.call('ports.list'), 'COM10');
  const encoded = Buffer.from(JSON.stringify(simulatorConfig()), 'utf8').toString('base64url');
  simulator = spawn(process.execPath, [root, `--user-data-dir=${simulatorProfile}`, '--module=simulator', `--simulator-config=${encoded}`], {
    cwd: root,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true
  });
  simulator.stdout.on('data', (chunk) => { simulatorOutput += chunk.toString('utf8'); });
  simulator.stderr.on('data', (chunk) => { simulatorOutput += chunk.toString('utf8'); });
  let ready = false;
  simulator.once('error', (error) => window.webContents.send('simulator:instance-status', { state: 'failed', message: error.message }));
  simulator.on('message', (message) => {
    if (message?.type === 'simulator-progress') simulatorProgress.push(`${message.stage}: ${message.message || ''}`);
    if (message?.type === 'simulator-activity') simulatorActivity.push(`${message.phase}: ${message.detail || ''}`);
    if (message?.type === 'simulator-ready') {
      ready = Boolean(message.ok);
      window.webContents.send('simulator:instance-status', {
        state: message.ok ? 'ready' : 'failed',
        message: message.message || ''
      });
    }
  });
  simulator.once('exit', (code) => {
    if (!ready && window && !window.isDestroyed()) {
      window.webContents.send('simulator:instance-status', { state: 'failed', message: `模拟实例提前退出（${code ?? 'unknown'}）` });
    }
  });
  return { launched: true, pending: true, message: '正在启动并校验 COM10 虚拟模拟实例' };
}

app.whenReady().then(async () => {
  try {
    protocol.handle('serialscope', (request) => {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const requested = path.resolve(rendererRoot, `.${pathname || '/index.html'}`);
      return net.fetch(pathToFileURL(requested).toString());
    });
    await startBackend();
    findRegisteredVirtualSimulatorPort(await backend.call('ports.list'), 'COM10');
    const opened = await backend.call('serial.open', { portName: 'COM11', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } });
    if (!opened?.ok) throw new Error(`COM11 打开失败：${opened?.message || '未知错误'}`);

    ipcMain.handle('backend:start', () => ({ started: true, message: '测试后端已连接' }));
    ipcMain.handle('backend:rpc', (_event, method, params) => backend.call(method, params));
    ipcMain.handle('workbench:beginExecution', async () => {
      const state = await backend.call('serial.status');
      if (!state?.isOpen || String(state.portName).toUpperCase() !== 'COM11') throw new Error('测试工作台未打开 COM11');
      return { target: 'simulation', portName: 'COM11' };
    });
    ipcMain.handle('workbench:endExecution', () => ({ ended: true }));
    ipcMain.handle('workbench:launchSimulator', () => launchSecondSimulator());
    ipcMain.handle('window:openModule', () => ({ opened: true }));
    ipcMain.handle('file:saveText', () => ({ canceled: true }));
    ipcMain.handle('file:openJson', () => ({ canceled: true }));

    window = new BrowserWindow({
      width: 1180,
      height: 820,
      show: true,
      backgroundColor: '#101215',
      webPreferences: { preload: path.join(root, 'src', 'main', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
    });
    window.webContents.on('console-message', (_event, _level, message, line, source) => console.error(`renderer ${source}:${line}: ${message}`));
    window.on('closed', () => { if (simulator && !simulator.killed) simulator.kill(); });
    await window.loadURL('serialscope://workbench/index.html');
    const evaluate = (expression) => window.webContents.executeJavaScript(expression, true);
    try {
      await waitFor(() => evaluate("document.querySelector('.react-flow') && document.querySelector('.pill.online')?.textContent.includes('COM11')"), 'React 工作台读取 COM11');
    } catch (error) {
      throw new Error(`${error.message}；工作台状态：${await evaluate("document.querySelector('.pill')?.textContent || document.body.textContent.slice(0, 500)")}`);
    }
    await evaluate(`(() => {
      const flow = JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2'));
      const query = flow.nodes.find((node) => node.id === 'query');
      const condition = flow.nodes.find((node) => node.id === 'condition');
      query.data = { ...query.data, macroId: 'macro-e2e-query', macroName: 'E2E 读取寄存器' };
      delete query.data.hex;
      condition.data = { ...condition.data, conditionType: 'rule', operator: 'contains', expected: 'Modbus 读应答' };
      localStorage.setItem('serialscope.device-workbench.flow.v2', JSON.stringify(flow));
      localStorage.setItem('serialscope.device-workbench.macros.v1', JSON.stringify([{ id: 'macro-e2e-query', name: 'E2E 读取寄存器', kind: 'query', mode: 'hex', data: '01 03 00 00 00 02 C4 0B', lineEnding: 'none', revision: 3, updatedAt: Date.now() }]));
      localStorage.setItem('serialscope.device-workbench.rules.v1', JSON.stringify([{ id: 'modbus-response', name: 'Modbus 读应答', pattern: '^01\\\\s*03', enabled: true }]));
      location.reload();
    })()`);
    await waitFor(() => evaluate("document.querySelector('.react-flow') && document.querySelector('.pill.online')?.textContent.includes('COM11')"), '引用宏工作台重载');
    await evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('启动第二个模拟实例')).click()");
    try {
      await waitFor(() => evaluate("document.querySelector('.run')?.textContent.includes('ready')"), '第二个 Electron 实例自动打开 COM10', 25000);
    } catch (error) {
      throw new Error(`${error.message}；工作台状态：${await evaluate("document.querySelector('.run')?.textContent || ''")}；子实例阶段：${simulatorProgress.join(' | ')}；子实例输出：${simulatorOutput}`);
    }
    await evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === '执行流程').click()");
    try {
      await waitFor(() => evaluate("document.querySelector('.run')?.textContent.includes('passed')"), 'COM11 工作台收到 COM10 模拟应答', 15000);
    } catch (error) {
      throw new Error(`${error.message}；工作台状态：${await evaluate("document.querySelector('.run')?.textContent || ''")}；报文：${await evaluate("document.querySelector('.execution-log')?.textContent || ''")}；子实例阶段：${simulatorProgress.join(' | ')}；子实例活动：${simulatorActivity.join(' | ')}`);
    }
    const transcript = await evaluate("document.querySelector('.execution-log')?.textContent || ''");
    if (!transcript.includes('RX') || !transcript.includes('01 03')) throw new Error(`未记录子实例应答：${transcript}`);
    const report = await evaluate("JSON.parse(localStorage.getItem('serialscope.device-workbench.reports.v1') || '[]')[0] || null");
    if (!report || report.result !== 'passed' || !report.flowSnapshot?.revision || !Array.isArray(report.macroSnapshot) || report.macroSnapshot.length < 1 || report.macroSnapshot[0].id !== 'macro-e2e-query' || report.macroSnapshot[0].revision !== 3
      || !Array.isArray(report.steps) || report.steps.length < 5 || !Array.isArray(report.frames) || report.frames.length < 1 || !report.frames[0].rules?.includes('Modbus 读应答') || !Number.isInteger(report.frames[0].sequence) || report.frames[0].sequence < 1) {
      throw new Error(`结构化报告快照不完整：${JSON.stringify(report)}`);
    }
    await evaluate("Array.from(document.querySelectorAll('.execution-log button')).find((button) => button.textContent.includes('重放报告')).click()");
    await waitFor(() => evaluate("document.querySelector('.run')?.textContent.includes('replay')"), '报告流程与宏快照重放');
    await evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === '执行流程').click()");
    await waitFor(() => evaluate("document.querySelector('.run')?.textContent.includes('passed')"), '重放报告后再次通过 COM11/COM10 流程', 15000);
    const replayedReport = await evaluate("JSON.parse(localStorage.getItem('serialscope.device-workbench.reports.v1') || '[]')[0] || null");
    if (replayedReport?.macroSnapshot?.[0]?.id !== 'macro-e2e-query' || replayedReport.macroSnapshot[0].revision !== 3 || !replayedReport.frames?.[0]?.rules?.includes('Modbus 读应答')) {
      throw new Error(`重放后执行未保持宏/规则语义：${JSON.stringify(replayedReport)}`);
    }
    console.log('工作台双 Electron 虚拟下位机：COM11 流程、COM10 子实例自动应答、结果报告通过');
    window.close();
    await closeResources();
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    await closeResources();
    app.exit(1);
  }
});
