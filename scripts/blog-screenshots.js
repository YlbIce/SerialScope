// 生成博客/公众号文档用截图。遍历主窗口各功能页面、AI 配置弹窗、React 工作台，输出到 artifacts/blog/。
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'blog');
const backendPath = path.join(root, 'backend', 'bin', 'serialscope-backend.exe');
const reactIndex = path.join(root, 'src', 'renderer-dist', 'index.html');

let window;
let backend;
let rpc;

fs.mkdirSync(outDir, { recursive: true });
app.setPath('userData', path.join(outDir, 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function send(channel, payload) {
  for (const target of BrowserWindow.getAllWindows()) {
    if (!target.isDestroyed()) target.webContents.send(channel, payload);
  }
}

async function startBackend() {
  const pipeName = `\\\\.\\pipe\\SerialScope.Blog.${randomUUID()}`;
  backend = spawn(backendPath, ['--pipe', pipeName], { stdio: 'ignore' });
  rpc = new NamedPipeRpcClient();
  rpc.on('notification', (method, params) => send('backend:rpc-notification', { method, params }));
  rpc.on('error', (error) => send('backend:log', `Named Pipe 错误：${error.message}`));
  rpc.on('disconnect', () => send('backend:log', 'Named Pipe 后端连接已断开'));
  await rpc.connect(pipeName);
  await rpc.call('backend.ping');
  return { started: true };
}

function stopBackend() {
  rpc?.close(); rpc = null;
  backend?.kill(); backend = null;
}

async function rv(expression) {
  return window.webContents.executeJavaScript(expression, true);
}

async function waitFor(expression, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await rv(expression)) return;
    } catch (_) {}
    await delay(50);
  }
  throw new Error(`UI timeout: ${description}`);
}

async function shot(name) {
  await delay(400);
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
  console.log(`截图: ${name}.png`);
}

// 导航到某页面并等待激活。
async function gotoPage(pageId, name) {
  await rv(`handleUiAction({ action: 'navigate', payload: { pageId: '${pageId}' } })`);
  await waitFor(`document.querySelector('#${pageId}').classList.contains('active')`, `navigate ${pageId}`);
  await shot(name);
}

async function exercise() {
  await waitFor("document.querySelector('#backendState') && document.querySelector('#backendState').textContent.includes('已连接')", 'backend connected');

  // 6 个主页面
  await gotoPage('page-terminal', '01-terminal');
  await gotoPage('page-trend', '02-trend');
  await gotoPage('page-rules', '03-rules');
  await gotoPage('page-macros', '04-macros');
  await gotoPage('page-simulator', '05-simulator');
  await gotoPage('page-protocol', '06-protocol');

  // AI 配置弹窗
  await rv("document.querySelector('#aiConfigButton').click()");
  await waitFor("!document.querySelector('#aiConfigModal').hidden", 'ai config modal');
  await shot('07-ai-config');
  await rv("document.querySelector('#closeAiConfigModalButton').click()");

  // 打开独立模块窗口（serial-config 为例）
  await rv("window.serialScope.openModuleWindow('serial-config')");
  await delay(800);
  const moduleWindow = BrowserWindow.getAllWindows().find((candidate) => candidate !== window);
  if (moduleWindow && !moduleWindow.isDestroyed()) {
    await moduleWindow.webContents.executeJavaScript("document.querySelector('#page-serial-config').classList.add('active')", true);
    await delay(500);
    const img = await moduleWindow.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, '08-serial-config-window.png'), img.toPNG());
    console.log('截图: 08-serial-config-window.png');
    moduleWindow.close();
  }

  // React 工作台（独立窗口）
  const workbench = new BrowserWindow({
    width: 1320,
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(root, 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await workbench.loadFile(reactIndex);
  await delay(1200);
  try {
    const img = await workbench.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, '09-react-workbench.png'), img.toPNG());
    console.log('截图: 09-react-workbench.png');
  } catch (error) {
    console.log('React 工作台截图失败:', error.message);
  }
  workbench.close();
}

app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  try {
    ipcMain.handle('backend:info', () => ({ transport: 'named-pipe', backendPath }));
    ipcMain.handle('backend:start', () => startBackend());
    ipcMain.handle('backend:rpc', (_event, method, params = {}) => {
      if (!rpc) throw new Error('Named Pipe 后端未连接');
      return rpc.call(method, params);
    });
    ipcMain.handle('ai:config', () => ({ provider: 'deepseek', enabled: true, allowDataUpload: true, saveApiKeyToDisk: false, hasApiKey: false, hasPersistedApiKey: false, keySource: 'none' }));
    ipcMain.handle('ai:test', () => ({ ok: true, reply: 'pong' }));
    ipcMain.handle('window:openModule', async (_event, moduleId) => {
      const mw = new BrowserWindow({
        width: 1000,
        height: 760,
        show: true,
        webPreferences: {
          preload: path.join(root, 'src', 'main', 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      });
      await mw.loadFile(path.join(root, 'src', 'renderer', 'index.html'), { query: { module: moduleId } });
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
    await exercise();
    console.log('博客截图完成');
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'error.txt'), `${error.stack || error}\n`);
    console.error(error.stack || error);
    app.exit(1);
  } finally {
    stopBackend();
  }
});
