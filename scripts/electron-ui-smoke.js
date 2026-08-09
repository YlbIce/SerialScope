const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const backendPath = path.join(root, 'backend', 'bin', 'serialscope-backend.exe');
const readerPath = path.join(root, 'backend', 'build', 'serialscope-virtual-serial-reader.exe');
const writerPath = path.join(root, 'backend', 'build', 'serialscope-virtual-serial-writer.exe');
const roundTripPath = path.join(root, 'backend', 'build', 'serialscope-virtual-serial-roundtrip.exe');

let window;
let backend;
let rpc;

fs.mkdirSync(artifacts, { recursive: true });
const smokeProfile = path.join(artifacts, 'electron-ui-smoke-profile');
fs.rmSync(smokeProfile, { recursive: true, force: true });
app.setPath('userData', smokeProfile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function send(channel, payload) {
  for (const target of BrowserWindow.getAllWindows()) {
    if (!target.isDestroyed()) target.webContents.send(channel, payload);
  }
}

async function startBackend() {
  if (backend && rpc) return { started: true, message: 'Native C++ 后端已运行' };
  const pipeName = `\\\\.\\pipe\\SerialScope.Native.ui-smoke-${randomUUID()}`;
  backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
  rpc = new NamedPipeRpcClient();
  rpc.on('notification', (method, params) => send('backend:rpc-notification', { method, params }));
  rpc.on('error', (error) => send('backend:log', `Named Pipe 错误：${error.message}`));
  rpc.on('disconnect', () => send('backend:log', 'Named Pipe 后端连接已断开'));
  try {
    await rpc.connect(pipeName);
    await rpc.call('backend.ping');
    return { started: true, message: 'Native C++ 后端已启动' };
  } catch (error) {
    rpc.close();
    rpc = null;
    backend.kill();
    backend = null;
    throw error;
  }
}

function stopBackend() {
  rpc?.close();
  rpc = null;
  backend?.kill();
  backend = null;
}

function runHelper(executable, args) {
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(executable)} failed (${code}): ${stderr || stdout}`)));
  });
}

async function rendererValue(expression) {
  return window.webContents.executeJavaScript(expression, true);
}

async function waitForRenderer(expression, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await rendererValue(expression)) return;
    await delay(50);
  }
  throw new Error(`UI timeout: ${description}`);
}

async function waitForWindow(windowToCheck, expression, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!windowToCheck.isDestroyed()
      && await windowToCheck.webContents.executeJavaScript(expression, true)) return;
    await delay(50);
  }
  throw new Error(`UI timeout: ${description}`);
}

async function exerciseUi() {
  await waitForRenderer("document.querySelector('#backendState').textContent.includes('已连接')", 'backend connected');
  await waitForRenderer("Array.from(document.querySelector('#portSelect').options).some((option) => option.value === 'COM10')", 'COM10 listed');
  await rendererValue("handleUiAction({ action: 'navigate', payload: { pageId: 'page-macros' } })");
  await waitForRenderer("document.querySelector('#page-macros').classList.contains('active')", 'menu navigation action');
  await rendererValue("handleUiAction({ action: 'navigate', payload: { pageId: 'page-terminal' } })");
  await waitForRenderer("document.querySelector('#page-terminal').classList.contains('active')", 'terminal navigation action');

  await rendererValue(`(() => {
    document.querySelector('#portSelect').value = 'COM10';
    document.querySelector('#baudRateSelect').value = '9600';
    document.querySelector('#openButton').click();
  })()`);
  await waitForRenderer("document.querySelector('#serialState').textContent.includes('已打开')", 'serial opened');

  const reader = runHelper(readerPath, ['COM11']);
  await delay(150);
  await rendererValue(`(() => {
    document.querySelector('#sendModeSelect').value = 'hex';
    document.querySelector('#sendModeSelect').dispatchEvent(new Event('change'));
    document.querySelector('#sendInput').value = 'CA FE';
    document.querySelector('#lineEndingSelect').value = 'none';
    document.querySelector('#toolbarSendButton').click();
  })()`);
  if (await reader !== 'CA FE') throw new Error('UI serial.send did not reach COM11');

  if (await runHelper(writerPath, ['COM11']) !== '41 42') throw new Error('COM11 writer did not run');
  await waitForRenderer("document.querySelector('#terminalLog').innerText.includes('41 42')", 'serial RX log');

  await rendererValue(`(() => {
    document.querySelector('#newMacroButton').click();
    document.querySelector('#macroNameInput').value = 'UI 验证宏';
    document.querySelector('#macroModeSelect').value = 'hex';
    document.querySelector('#macroDataInput').value = 'CA FE';
    document.querySelector('#macroLineEndingSelect').value = 'none';
    document.querySelector('#saveMacroButton').click();
  })()`);
  await waitForRenderer("JSON.parse(localStorage.getItem('serialscope.macros')).some((macro) => macro.name === 'UI 验证宏' && macro.data === 'CA FE')", 'macro persistence');
  const macroReader = runHelper(readerPath, ['COM11']);
  await delay(150);
  await rendererValue("Array.from(document.querySelectorAll('.macro-button')).find((button) => button.innerText.includes('UI 验证宏')).click()");
  if (await macroReader !== 'CA FE') throw new Error('macro execution did not reach COM11');

  await rendererValue("window.serialScope.openModuleWindow('macros')");
  const moduleWindow = BrowserWindow.getAllWindows().find((candidate) => candidate !== window);
  if (!moduleWindow) throw new Error('macro module window was not created');
  await waitForWindow(moduleWindow,
    "document.querySelector('#page-macros').classList.contains('active') && document.querySelector('#backendState').textContent.includes('已连接')",
    'module window loaded macro page and backend state');

  await rendererValue("document.querySelector('#toolbarCloseButton').click()");
  await waitForRenderer("document.querySelector('#serialState').textContent.includes('未打开')", 'serial closed before simulator test');
  await rendererValue(`(() => {
    document.querySelector('#portSelect').value = 'COM11';
    document.querySelector('#openButton').click();
  })()`);
  await waitForRenderer("document.querySelector('#serialState').textContent.includes('已打开')", 'simulator serial opened');
  await rendererValue(`(() => {
    document.querySelector('#simulatorEnabledCheck').checked = true;
    document.querySelector('#simulatorBuiltinSelect').value = 'none';
    document.querySelector('#addSimulatorRuleButton').click();
    document.querySelector('.simulator-match').value = '41 42';
    document.querySelector('.simulator-response').value = 'CA FE';
    document.querySelector('#saveSimulatorButton').click();
  })()`);
  await waitForRenderer("document.querySelector('#simulatorStatus').textContent.includes('已启用')", 'simulator enabled');
  let simulatorReply;
  try {
    simulatorReply = await runHelper(roundTripPath, ['COM10', '41 42', 'CA FE']);
  } catch (error) {
    throw new Error(`custom simulator round trip: ${error.message}`);
  }
  if (simulatorReply !== 'CA FE') {
    throw new Error('simulated lower device did not reply through COM10/COM11');
  }
  await rendererValue(`(() => {
    document.querySelector('#simulatorBuiltinSelect').value = 'at';
    document.querySelector('#saveSimulatorButton').click();
  })()`);
  try {
    simulatorReply = await runHelper(roundTripPath, ['COM10', '41 54', '4F 4B 0D 0A']);
  } catch (error) {
    throw new Error(`AT simulator round trip: ${error.message}`);
  }
  if (simulatorReply !== '4F 4B 0D 0A') {
    throw new Error('AT built-in simulator did not reply through COM10/COM11');
  }
  const simulatorAlgorithms = await rendererValue(`(() => ({
    random: expandRandomHexTemplate('AA {{RAND8}} {{RANDHEX:2}}'),
    modbus: modbusSimulatorResponse('01 03 00 00 00 02 C4 0B')
  }))()`);
  if (!/^AA [0-9A-F]{2} [0-9A-F]{2} [0-9A-F]{2}$/.test(simulatorAlgorithms.random)
    || !/^01 03 04(?: [0-9A-F]{2}){6}$/.test(simulatorAlgorithms.modbus)) {
    throw new Error(`simulator random placeholder or Modbus response algorithm is invalid: ${JSON.stringify(simulatorAlgorithms)}`);
  }

  fs.mkdirSync(artifacts, { recursive: true });
  const screenshot = await window.webContents.capturePage();
  fs.writeFileSync(path.join(artifacts, 'electron-ui-interaction.png'), screenshot.toPNG());

  await rendererValue("document.querySelector('#toolbarCloseButton').click()");
  await waitForRenderer("document.querySelector('#serialState').textContent.includes('未打开')", 'serial closed');
}

app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  try {
    ipcMain.handle('backend:info', () => ({ transport: 'named-pipe', backendPath }));
    ipcMain.handle('backend:start', () => startBackend());
    ipcMain.handle('backend:rpc', (_event, method, params = {}) => {
      if (!['ports.list', 'serial.status', 'serial.open', 'serial.close', 'serial.send'].includes(method)) throw new Error('不允许的后端 RPC 方法');
      if (!rpc) throw new Error('Named Pipe 后端未连接');
      return rpc.call(method, params);
    });
    ipcMain.handle('window:openModule', async (_event, moduleId) => {
      const moduleWindow = new BrowserWindow({
        width: 1000,
        height: 760,
        show: false,
        webPreferences: {
          preload: path.join(root, 'src', 'main', 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      });
      await moduleWindow.loadFile(path.join(root, 'src', 'renderer', 'index.html'), { query: { module: moduleId } });
      return { opened: true, moduleId };
    });
    ipcMain.handle('file:saveText', () => ({ canceled: true }));
    ipcMain.handle('file:openJson', () => ({ canceled: true }));

    window = new BrowserWindow({
      width: 1480,
      height: 940,
      show: true,
      backgroundColor: '#101215',
      webPreferences: {
        preload: path.join(root, 'src', 'main', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    await window.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
    await exerciseUi();
    console.log('Electron visible UI interaction passed');
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(artifacts, 'electron-ui-error.txt'), `${error.stack || error}\n`);
    console.error(error.stack || error);
    app.exit(1);
  } finally {
    stopBackend();
  }
});
