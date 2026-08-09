const { app, BrowserWindow, Menu, ipcMain, dialog, net, protocol, webContents } = require('electron');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { NamedPipeRpcClient } = require('./named-pipe-rpc');
const { createWorkbenchExecutionAuthorizer } = require('./workbench-execution');
const { findRegisteredVirtualSimulatorPort } = require('./virtual-simulator-port');

// 串口工具的核心功能不依赖 GPU。部分 Windows 环境缺少 Chromium GPU
// 子进程所需运行库时，强制软件渲染可避免应用在创建窗口前直接退出。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
protocol.registerSchemesAsPrivileged([{
  scheme: 'serialscope',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

let mainWindow = null;
const moduleWindows = new Map();
const requestedStartupModule = process.argv.find((argument) => argument.startsWith('--module='))?.slice('--module='.length) || null;
const startupModule = requestedStartupModule === 'simulator' ? 'simulator' : null;
const startupSimulatorConfig = (() => {
  const encoded = process.argv.find((argument) => argument.startsWith('--simulator-config='))?.slice('--simulator-config='.length);
  if (!encoded) return null;
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
})();
let backendProcess = null;
let backendRpc = null;
let simulatorInstance = null;
let isQuitting = false;
const simulatorReadyTimeoutMs = 30000;
const workbenchExecution = createWorkbenchExecutionAuthorizer({
  getSerialState: async () => {
    if (!backendRpc) throw new Error('Named Pipe 后端未连接');
    return backendRpc.call('serial.status');
  },
  confirmHardware: async (state, owner) => {
    const confirmation = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: '确认真实设备流程执行',
      message: `将向 ${state.portName || '当前串口'} 发送流程报文。`,
      detail: '请确认设备、连接参数和所有发送报文均已获授权。该确认仅对本次工作台执行有效。',
      buttons: ['确认执行', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    return confirmation.response === 0;
  }
});

function sendToRenderer(channel, payload) {
  for (const target of [mainWindow, ...moduleWindows.values()]) {
    if (!target || target.isDestroyed() || target.webContents.isDestroyed()) continue;
    target.webContents.send(channel, payload);
  }
}

function updateSimulatorOwnership() {
  const simulatorWindow = moduleWindows.get('simulator');
  for (const target of [mainWindow, ...moduleWindows.values()]) {
    if (!target || target.isDestroyed() || target.webContents.isDestroyed()) continue;
    target.webContents.send('simulator:ownership', {
      active: target === simulatorWindow || (!simulatorWindow && target === mainWindow)
    });
  }
}

function moduleForWebContents(contents) {
  for (const [moduleId, target] of moduleWindows.entries()) {
    if (!target.isDestroyed() && target.webContents === contents) return moduleId;
  }
  return null;
}

async function assertRegisteredVirtualSimulatorPort(portName = 'COM10') {
  if (!backendRpc) throw new Error('Named Pipe 后端未连接');
  return findRegisteredVirtualSimulatorPort(await backendRpc.call('ports.list'), portName);
}

function notifySimulatorInstance(requesterId, payload) {
  const target = webContents.fromId(requesterId);
  if (target && !target.isDestroyed()) target.send('simulator:instance-status', payload);
}

function createSimulatorUserDataPath() {
  const instancePath = path.join(app.getPath('temp'), 'SerialScope', 'simulator-instances', randomUUID());
  fs.mkdirSync(instancePath, { recursive: true });
  return instancePath;
}

function cleanupSimulatorUserData(userDataPath) {
  if (!userDataPath) return;
  fs.promises.rm(userDataPath, { recursive: true, force: true }).catch(() => {});
}

function stopSimulatorInstance() {
  const instance = simulatorInstance;
  if (!instance) return null;
  simulatorInstance = null;
  if (instance.readyTimer) clearTimeout(instance.readyTimer);
  if (instance.child && !instance.child.killed && instance.child.exitCode === null) instance.child.kill();
  else cleanupSimulatorUserData(instance.userDataPath);
  return instance;
}

function reportStartupSimulatorProgress(stage, message) {
  if (startupModule === 'simulator' && typeof process.send === 'function') {
    process.send({ type: 'simulator-progress', stage, message });
  }
}

function installRendererProtocol() {
  const rendererRoot = path.resolve(__dirname, '..', 'renderer-dist');
  protocol.handle('serialscope', (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const requested = path.resolve(rendererRoot, `.${pathname || '/index.html'}`);
    if (!requested.startsWith(`${rendererRoot}${path.sep}`) && requested !== path.join(rendererRoot, 'index.html')) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(requested).toString());
  });
}


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
      message: `未找到 Native C++ 后端：${exe}`
    };
  }

  if (backendProcess) {
    return { started: true, message: 'Native C++ 后端已运行' };
  }

  const pipeName = `\\\\.\\pipe\\SerialScope.Native.${randomUUID()}`;
  backendProcess = spawn(exe, ['--pipe', pipeName], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (chunk) => {
    sendToRenderer('backend:log', chunk.toString('utf8'));
  });

  backendProcess.stderr.on('data', (chunk) => {
    sendToRenderer('backend:log', chunk.toString('utf8'));
  });

  backendProcess.on('exit', (code) => {
    if (backendRpc) backendRpc.close();
    backendRpc = null;
    backendProcess = null;
    sendToRenderer('backend:exit', code);
    if (!isQuitting) {
      sendToRenderer('backend:log', `Native C++ 后端已退出，代码 ${code ?? 'unknown'}`);
    }
  });

  backendRpc = new NamedPipeRpcClient();
  const startedProcess = backendProcess;
  const startedRpc = backendRpc;
  backendRpc.on('notification', (method, params) => {
    sendToRenderer('backend:rpc-notification', { method, params });
  });
  backendRpc.on('error', (error) => sendToRenderer('backend:log', `Named Pipe 错误：${error.message}`));
  backendRpc.on('disconnect', () => sendToRenderer('backend:log', 'Named Pipe 后端连接已断开'));
  startedRpc.connect(pipeName)
    .then(() => startedRpc.call('backend.ping'))
    .then((result) => {
      sendToRenderer('backend:log', `Named Pipe 已连接：${result.name}`);
      reportStartupSimulatorProgress('backend-connected', '模拟实例后端已连接');
    })
    .catch((error) => {
      sendToRenderer('backend:log', `Named Pipe 后端连接失败：${error.message}`);
      reportStartupSimulatorProgress('backend-failed', `模拟实例后端连接失败：${error.message}`);
      if (backendRpc === startedRpc) {
        backendRpc.close();
        backendRpc = null;
      }
      if (backendProcess === startedProcess) startedProcess.kill();
    });

  return { started: true, message: `Native C++ 后端正在启动：${exe}` };
}

function stopBackend() {
  isQuitting = true;
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (backendRpc) backendRpc.close();
  backendRpc = null;
}

function createWindow(moduleId = null) {
  const target = new BrowserWindow({
    width: moduleId === 'serial-config' ? 620 : (moduleId ? 1180 : 1480),
    height: moduleId === 'serial-config' ? 760 : (moduleId ? 820 : 940),
    minWidth: moduleId === 'serial-config' ? 520 : (moduleId ? 900 : 1180),
    minHeight: moduleId === 'serial-config' ? 560 : (moduleId ? 640 : 780),
    backgroundColor: '#101215',
    resizable: true,
    maximizable: true,
    title: moduleId ? `SerialScope · ${moduleId}` : 'SerialScope Native',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 当前 Windows/Electron 组合中，React 工作台和独立进程的模拟器在 sandbox=true
      // 时会出现 renderer launch-failed。两者仍保持 contextIsolation、禁用 Node 和严格
      // CSP；这一兼容性例外在 L2 证据中持续跟踪。
      sandbox: moduleId === 'workbench' || (moduleId === 'simulator' && startupModule === 'simulator') ? false : true
    }
  });

  // React 工作台先以独立窗口渐进上线；串口终端等既有模块继续使用已验证的
  // 原生渲染器，避免一次框架迁移影响现场调试能力。
  const reactWorkbench = path.join(__dirname, '..', 'renderer-dist', 'index.html');
  const legacyRenderer = path.join(__dirname, '..', 'renderer', 'index.html');
  const renderer = moduleId === 'workbench' && fs.existsSync(reactWorkbench)
    ? reactWorkbench
    : legacyRenderer;
  if (renderer === reactWorkbench) target.loadURL('serialscope://workbench/index.html');
  else target.loadFile(renderer, moduleId ? { query: { module: moduleId } } : undefined);

  if (process.env.ELECTRON_DEV === '1' && !moduleId) {
    target.webContents.openDevTools({ mode: 'detach' });
  }

  if (moduleId === 'simulator' && startupSimulatorConfig) {
    target.webContents.on('did-fail-load', (_event, code, description) => {
      reportStartupSimulatorProgress('renderer-failed', `模拟实例页面加载失败（${code}）：${description}`);
    });
    target.webContents.on('render-process-gone', (_event, details) => {
      reportStartupSimulatorProgress('renderer-failed', `模拟实例渲染进程退出：${details.reason}`);
    });
    target.webContents.on('preload-error', (_event, _preloadPath, error) => {
      reportStartupSimulatorProgress('renderer-failed', `模拟实例预加载失败：${error.message}`);
    });
  }

  target.on('closed', () => {
    workbenchExecution.end(target.webContents.id);
    if (moduleId === 'workbench') stopSimulatorInstance();
    if (moduleId) moduleWindows.delete(moduleId);
    else mainWindow = null;
    updateSimulatorOwnership();
  });
  target.webContents.once('did-finish-load', updateSimulatorOwnership);
  target.webContents.once('did-finish-load', () => {
    if (moduleId === 'simulator' && startupSimulatorConfig) {
      reportStartupSimulatorProgress('renderer-loaded', '模拟实例渲染器已加载');
      target.webContents.send('simulator:bootstrap', startupSimulatorConfig);
    }
  });
  if (moduleId) moduleWindows.set(moduleId, target);
  else mainWindow = target;
  return target;
}

function openModuleWindow(moduleId) {
  const allowedModules = new Set(['terminal', 'trend', 'rules', 'macros', 'simulator', 'serial-config', 'workbench']);
  if (!allowedModules.has(moduleId)) throw new Error('不支持的独立模块');
  const existing = moduleWindows.get(moduleId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { opened: false, moduleId };
  }
  createWindow(moduleId);
  return { opened: true, moduleId };
}

function sendUiAction(action, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('ui:action', { action, payload });
}

function createApplicationMenu() {
  const page = (label, pageId, accelerator) => ({ label, accelerator, click: () => sendUiAction('navigate', { pageId }) });
  const moduleWindow = (label, moduleId) => ({ label, click: () => openModuleWindow(moduleId) });
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '保存当前配置', accelerator: 'Ctrl+S', click: () => sendUiAction('save-profile') },
        { label: '加载配置…', accelerator: 'Ctrl+O', click: () => sendUiAction('load-profile') },
        { type: 'separator' },
        { label: '导出串口日志…', click: () => sendUiAction('export-log') },
        { label: '导出采集数据…', click: () => sendUiAction('export-samples') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        page('串口调试', 'page-terminal', 'Ctrl+1'),
        page('趋势监视', 'page-trend', 'Ctrl+2'),
        page('规则配置', 'page-rules', 'Ctrl+3'),
        page('宏命令', 'page-macros', 'Ctrl+4'),
        page('模拟下位机', 'page-simulator', 'Ctrl+5'),
        page('AI 规约解析', 'page-protocol', 'Ctrl+6'),
        { type: 'separator' },
        { label: '恢复默认布局', click: () => sendUiAction('reset-layout') }
      ]
    },
    {
      label: '串口',
      submenu: [
        { label: '启动后端', click: () => sendUiAction('start-backend') },
        { label: '刷新串口', accelerator: 'Ctrl+R', click: () => sendUiAction('refresh-ports') },
        { type: 'separator' },
        { label: '串口配置…', accelerator: 'Ctrl+Shift+O', click: () => sendUiAction('open-serial') },
        { label: '关闭当前串口', accelerator: 'Ctrl+Shift+W', click: () => sendUiAction('close-serial') },
        { label: '发送当前报文', accelerator: 'Ctrl+Enter', click: () => sendUiAction('send-current') },
        { type: 'separator' },
        { label: '编辑高亮规则…', click: () => sendUiAction('edit-rules') }
      ]
    },
    {
      label: '窗口',
      submenu: [
        moduleWindow('通信测试工作台', 'workbench'),
        { type: 'separator' },
        moduleWindow('串口配置窗口', 'serial-config'),
        { type: 'separator' },
        moduleWindow('串口调试窗口', 'terminal'),
        moduleWindow('趋势监视窗口', 'trend'),
        moduleWindow('规则配置窗口', 'rules'),
        moduleWindow('宏命令窗口', 'macros'),
        moduleWindow('模拟下位机窗口', 'simulator')
      ]
    },
    {
      label: '帮助',
      submenu: [{ label: '关于 SerialScope', click: () => sendUiAction('about') }]
    }
  ]);
}

ipcMain.handle('backend:info', () => ({
  transport: 'named-pipe',
  backendPath: backendPath()
}));

ipcMain.handle('backend:start', () => startBackend());

ipcMain.handle('workbench:beginExecution', async (event, request = {}) => {
  if (moduleForWebContents(event.sender) !== 'workbench') throw new Error('仅通信测试工作台可以申请执行权限');
  const owner = BrowserWindow.fromWebContents(event.sender);
  return workbenchExecution.begin(event.sender.id, request.target, owner);
});

ipcMain.handle('workbench:endExecution', (event) => {
  workbenchExecution.end(event.sender.id);
  return { ended: true };
});

ipcMain.handle('workbench:launchSimulator', async (_event, simulatorConfig) => {
  if (moduleForWebContents(_event.sender) !== 'workbench') throw new Error('仅通信测试工作台可以启动模拟实例');
  if (simulatorInstance && !simulatorInstance.child.killed && simulatorInstance.child.exitCode === null) {
    return { launched: false, pending: true, message: '模拟实例已在运行或启动中' };
  }
  const requested = simulatorConfig && typeof simulatorConfig === 'object' ? simulatorConfig : {};
  const allowedBuiltins = new Set(['none', 'echo', 'at', 'modbus']);
  const config = {
    enabled: true,
    builtIn: allowedBuiltins.has(requested.builtIn) ? requested.builtIn : 'modbus',
    delayMs: Math.max(0, Math.min(10000, Number(requested.delayMs) || 20)),
    rules: Array.isArray(requested.rules) ? requested.rules.slice(0, 100).map((rule) => ({
      enabled: Boolean(rule?.enabled),
      matchHex: String(rule?.matchHex || '').slice(0, 4096),
      responseHex: String(rule?.responseHex || '').slice(0, 4096)
    })) : [],
    // 独立模拟实例只允许占用用户已授权的虚拟配对端 COM10，拒绝由 Renderer 指定真实端口。
    serial: { portName: 'COM10', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } }
  };
  if (JSON.stringify(config).length > 24000) throw new Error('模拟配置过大，已拒绝启动实例');
  await assertRegisteredVirtualSimulatorPort('COM10');
  const encoded = Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
  const userDataPath = createSimulatorUserDataPath();
  const child = spawn(process.execPath, [app.getAppPath(), `--user-data-dir=${userDataPath}`, '--module=simulator', `--simulator-config=${encoded}`], {
    cwd: app.getAppPath(),
    detached: false,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: false
  });
  const instance = { child, requesterId: _event.sender.id, ready: false, userDataPath, readyTimer: null, failureNotified: false };
  simulatorInstance = instance;
  instance.readyTimer = setTimeout(() => {
    if (simulatorInstance !== instance || instance.ready) return;
    instance.failureNotified = true;
    notifySimulatorInstance(instance.requesterId, { state: 'failed', message: `模拟实例在 ${simulatorReadyTimeoutMs / 1000} 秒内未完成 COM10 就绪校验` });
    stopSimulatorInstance();
  }, simulatorReadyTimeoutMs);
  child.on('message', (message) => {
    if (message?.type === 'simulator-progress') {
      notifySimulatorInstance(instance.requesterId, { state: message.stage.endsWith('-failed') ? 'failed' : 'starting', message: message.message || '' });
      return;
    }
    if (message?.type === 'simulator-ready') {
      instance.ready = Boolean(message.ok);
      if (instance.readyTimer) clearTimeout(instance.readyTimer);
      notifySimulatorInstance(instance.requesterId, { state: message.ok ? 'ready' : 'failed', message: message.message || '' });
      if (!message.ok) {
        instance.failureNotified = true;
        if (simulatorInstance === instance) stopSimulatorInstance();
      }
    }
  });
  child.once('error', (error) => {
    instance.failureNotified = true;
    if (instance.readyTimer) clearTimeout(instance.readyTimer);
    notifySimulatorInstance(instance.requesterId, { state: 'failed', message: `模拟实例启动失败：${error.message}` });
    if (simulatorInstance === instance) simulatorInstance = null;
    cleanupSimulatorUserData(instance.userDataPath);
  });
  child.once('exit', (code) => {
    if (instance.readyTimer) clearTimeout(instance.readyTimer);
    if (simulatorInstance === instance) simulatorInstance = null;
    cleanupSimulatorUserData(instance.userDataPath);
    if (!instance.failureNotified) notifySimulatorInstance(instance.requesterId, instance.ready
      ? { state: 'stopped', message: `模拟实例已退出（${code ?? 'unknown'}）` }
      : { state: 'failed', message: `模拟实例提前退出（${code ?? 'unknown'}）` });
  });
  return { launched: true, pending: true, message: '正在启动并校验 COM10 虚拟模拟实例' };
});

ipcMain.handle('simulator:validateAutoPort', async (event, portName) => {
  if (moduleForWebContents(event.sender) !== 'simulator') throw new Error('仅模拟下位机窗口可以验证自动端口');
  await assertRegisteredVirtualSimulatorPort(portName);
  reportStartupSimulatorProgress('port-verified', `${portName} 已通过 ELTIMA 虚拟串口校验`);
  return { approved: true };
});

ipcMain.handle('simulator:reportReady', (event, result = {}) => {
  if (moduleForWebContents(event.sender) !== 'simulator') throw new Error('仅模拟下位机窗口可以报告状态');
  if (typeof process.send === 'function') process.send({ type: 'simulator-ready', ok: Boolean(result.ok), message: String(result.message || '') });
  return { delivered: true };
});

ipcMain.on('simulator:activity', (event, activity = {}) => {
  if (moduleForWebContents(event.sender) !== 'simulator' || typeof process.send !== 'function') return;
  process.send({
    type: 'simulator-activity',
    phase: String(activity.phase || 'unknown').slice(0, 32),
    detail: String(activity.detail || '').slice(0, 1024)
  });
});

const allowedRpcMethods = new Set(['ports.list', 'serial.status', 'serial.open', 'serial.close', 'serial.send', 'ai.status', 'ai.configure', 'ai.parseProtocol', 'ai.generateCommands']);

ipcMain.handle('backend:rpc', async (_event, method, params = {}) => {
  if (typeof method !== 'string' || !allowedRpcMethods.has(method)) throw new Error('不允许的后端 RPC 方法');
  if (params === null || typeof params !== 'object' || Array.isArray(params)) throw new Error('RPC 参数必须是对象');
  if (!backendRpc) throw new Error('Named Pipe 后端未连接');
  if (method === 'serial.send' && moduleForWebContents(_event.sender) === 'workbench') {
    await workbenchExecution.validateSend(_event.sender.id);
  }
  return backendRpc.call(method, params);
});

ipcMain.handle('window:openModule', (_event, moduleId) => openModuleWindow(moduleId));

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
  installRendererProtocol();
  Menu.setApplicationMenu(createApplicationMenu());
  startBackend();
  createWindow(startupModule);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopSimulatorInstance();
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
