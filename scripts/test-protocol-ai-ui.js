// 验证 page-protocol 规约解析 UI 端到端（不依赖虚拟串口）。
// 覆盖：导航、启用 AI、ai.status、ai.parseProtocol 渲染、字段校正保存到 localStorage。
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const root = path.join(__dirname, '..');
const backendPath = path.join(root, 'backend', 'bin', 'serialscope-backend.exe');
let window;
let backend;
let rpc;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startBackend() {
  const pipeName = `\\\\.\\pipe\\SerialScope.Native.protocol-ui-${randomUUID()}`;
  backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
  rpc = new NamedPipeRpcClient();
  await rpc.connect(pipeName);
  await rpc.call('backend.ping');
}

function stopBackend() {
  rpc?.close();
  backend?.kill();
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

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  try {
    await startBackend();
    ipcMain.handle('backend:info', () => ({ transport: 'named-pipe', backendPath }));
    ipcMain.handle('backend:start', () => ({ started: true }));
    ipcMain.handle('backend:rpc', (_event, method, params = {}) => {
      if (!['ports.list', 'serial.status', 'ai.status', 'ai.configure', 'ai.parseProtocol', 'ai.generateCommands'].includes(method)) throw new Error('不允许的后端 RPC 方法');
      if (!rpc) throw new Error('Named Pipe 后端未连接');
      return rpc.call(method, params);
    });
    ipcMain.handle('file:saveText', () => ({ canceled: true }));
    ipcMain.handle('file:openJson', () => ({ canceled: true }));

    window = new BrowserWindow({
      width: 1200, height: 800, show: false,
      webPreferences: {
        preload: path.join(root, 'src', 'main', 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: false
      }
    });
    await window.loadFile(path.join(root, 'src', 'renderer', 'index.html'));

    // 1. 导航到 page-protocol
    await rendererValue("handleUiAction({ action: 'navigate', payload: { pageId: 'page-protocol' } })");
    await waitForRenderer("document.querySelector('#page-protocol').classList.contains('active')", 'protocol page active');

    // 2. AI 初始未启用
    await waitForRenderer("document.querySelector('#aiStatusLabel').textContent.includes('AI 未启用')", 'AI initially disabled');
    if (await rendererValue("document.querySelector('#aiParseButton').disabled") !== true) {
      throw new Error('parse button should be disabled when AI not enabled');
    }

    // 3. 启用 AI
    await rendererValue("document.querySelector('#aiEnableButton').click()");
    await waitForRenderer("document.querySelector('#aiStatusLabel').textContent.includes('AI 已启用')", 'AI enabled');
    if (await rendererValue("document.querySelector('#aiParseButton').disabled") !== false) {
      throw new Error('parse button should be enabled after AI enabled');
    }

    // 4. 输入规约文本并解析
    await rendererValue(`(() => {
      document.querySelector('#protocolTextInput').value = '帧头 0xAA 0x55；长度域 1 字节位于第 3 字节；之后命令码与数据域。';
      document.querySelector('#aiParseButton').click();
    })()`);
    await waitForRenderer(
      "document.querySelector('#protocolParseResult .protocol-summary')?.textContent.includes('0xAA 0x55')",
      'protocol parse result rendered with header');

    // 5. 解析结果为 mock 确定性：2 个字段
    const fieldCount = await rendererValue("document.querySelectorAll('#protocolParseResult .protocol-field-row').length");
    if (fieldCount !== 2) throw new Error(`expected 2 fields, got ${fieldCount}`);

    // 6. 校正第一个字段名并保存
    await rendererValue(`(() => {
      const row = document.querySelector('#protocolParseResult .protocol-field-row');
      row.querySelector('.pf-name').value = '命令码';
      row.querySelector('.pf-offset').value = '2';
      document.querySelector('#saveProtocolButtonInner').click();
    })()`);
    await waitForRenderer(
      "JSON.parse(localStorage.getItem('serialscope.protocol'))?.fields?.[0]?.name === '命令码'",
      'protocol correction persisted to localStorage');

    // 7. 命令生成按钮应在启用后可用
    if (await rendererValue("document.querySelector('#aiGenerateButton').disabled") !== false) {
      throw new Error('generate button should be enabled after AI enabled');
    }

    // 8. 生成命令并展示
    await rendererValue("document.querySelector('#aiGenerateButton').click()");
    await waitForRenderer(
      "document.querySelectorAll('#commandGenerateResult .command-row').length === 2",
      'command generation rendered 2 commands');
    const firstCommandName = await rendererValue("document.querySelector('#commandGenerateResult .command-row strong').textContent");
    if (firstCommandName !== 'ReadDeviceInfo') throw new Error(`expected first command ReadDeviceInfo, got ${firstCommandName}`);
    const firstHex = await rendererValue("document.querySelector('#commandGenerateResult .command-row code').textContent");
    if (firstHex !== 'AA 55 01') throw new Error(`expected code 'AA 55 01', got '${firstHex}'`);

    // 9. 加入宏库并验证持久化
    await rendererValue("document.querySelector('#commandGenerateResult [data-add-command=\"0\"]').click()");
    await waitForRenderer(
      "JSON.parse(localStorage.getItem('serialscope.macros'))?.some?.((macro) => macro.name === 'ReadDeviceInfo' && macro.data === 'AA 55 01')",
      'command added to macro library');

    console.log('Protocol AI UI interaction passed');
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    app.exit(1);
  } finally {
    stopBackend();
  }
});
