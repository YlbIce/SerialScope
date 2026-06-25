const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WS_PORT = 47990;

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;

function backendPath() {
  if (process.env.SERIALSCOPE_BACKEND) {
    return process.env.SERIALSCOPE_BACKEND;
  }
  const exe = process.platform === 'win32' ? 'serialscope-backend.exe' : 'serialscope-backend';
  return path.join(app.getAppPath(), 'backend', 'bin', exe);
}

function startBackend() {
  const exe = backendPath();
  if (!fs.existsSync(exe)) {
    return {
      started: false,
      message: `未找到 Boost 后端：${exe}`
    };
  }

  if (backendProcess) {
    return { started: true, message: 'Boost 后端已运行' };
  }

  backendProcess = spawn(exe, ['--port', String(WS_PORT)], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (chunk) => {
    mainWindow?.webContents.send('backend:log', chunk.toString('utf8'));
  });

  backendProcess.stderr.on('data', (chunk) => {
    mainWindow?.webContents.send('backend:log', chunk.toString('utf8'));
  });

  backendProcess.on('exit', (code) => {
    backendProcess = null;
    mainWindow?.webContents.send('backend:exit', code);
    if (!isQuitting) {
      mainWindow?.webContents.send('backend:log', `Boost 后端已退出，代码 ${code ?? 'unknown'}`);
    }
  });

  return { started: true, message: `Boost 后端已启动：${exe}` };
}

function stopBackend() {
  isQuitting = true;
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: '#101215',
    title: 'SerialScope Boost',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.env.ELECTRON_DEV === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.handle('backend:info', () => ({
  wsUrl: `ws://127.0.0.1:${WS_PORT}`,
  backendPath: backendPath()
}));

ipcMain.handle('backend:start', () => startBackend());

ipcMain.handle('file:saveText', async (_event, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || '保存文件',
    defaultPath: options.defaultPath || 'serialscope.txt',
    filters: options.filters || [{ name: 'Text', extensions: ['txt'] }],
    properties: ['createDirectory']
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true, message: '已取消保存' };
  }

  await fs.promises.writeFile(result.filePath, String(options.content || ''), 'utf8');
  return { ok: true, canceled: false, filePath: result.filePath, message: '文件已保存' };
});

ipcMain.handle('file:openJson', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || '打开配置',
    filters: options.filters || [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true, message: '已取消打开' };
  }

  try {
    const filePath = result.filePaths[0];
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { ok: true, canceled: false, filePath, data: JSON.parse(content) };
  } catch (error) {
    return { ok: false, canceled: false, message: `配置文件读取失败：${error.message}` };
  }
});

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
