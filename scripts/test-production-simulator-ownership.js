const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const electron = [
  path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
].find((candidate) => fs.existsSync(candidate));
if (!electron) throw new Error('未找到 Electron 可执行文件。');

const roundTrip = path.join(root, 'backend', 'build', 'serialscope-virtual-serial-roundtrip.exe');
const debugPort = 9300 + Math.floor(Math.random() * 500);
const profile = path.join(root, 'artifacts', 'electron-production-simulator-profile');
fs.rmSync(profile, { recursive: true, force: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function helper(executable, args) {
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => child.on('exit', (code) => {
    if (code === 0) resolve(stdout.trim());
    else reject(new Error(`${path.basename(executable)} failed (${code}): ${stderr || stdout}`));
  }));
}

function debugEndpoint(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${debugPort}${pathname}`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function targets() { return debugEndpoint('/json/list'); }

async function waitForTargets(predicate, description, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const found = (await targets()).filter((target) => target.type === 'page');
      const matched = predicate(found);
      if (matched) return matched;
    } catch {
      // Electron has not opened the debugging endpoint yet.
    }
    await delay(80);
  }
  throw new Error(`Timed out: ${description}`);
}

class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return result.result.value;
  }

  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function resizeWindow(cdp, width, height, label) {
  await cdp.evaluate(`window.resizeTo(${width}, ${height}); true`);
  await delay(120);
  const bounds = await cdp.evaluate('[window.outerWidth, window.outerHeight]');
  if (bounds[0] !== width || bounds[1] !== height) {
    throw new Error(`${label} resize mismatch: expected ${width}x${height}, got ${bounds[0]}x${bounds[1]}`);
  }
}

async function waitForEval(cdp, expression, description, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await delay(60);
  }
  throw new Error(`Timed out: ${description}`);
}

async function openAndVerifyModule(main, mainTargetId, moduleId, assertion, resize) {
  await main.evaluate(`window.serialScope.openModuleWindow('${moduleId}')`);
  const pages = await waitForTargets((items) => items.length === 2 ? items : null, `${moduleId} module window`);
  const target = pages.find((item) => item.id !== mainTargetId);
  const moduleWindow = new Cdp(target.webSocketDebuggerUrl);
  try {
    await waitForEval(moduleWindow, assertion, `${moduleId} module UI and backend state`);
    await resizeWindow(moduleWindow, resize.width, resize.height, moduleId);
    await waitForEval(moduleWindow, assertion, `${moduleId} module remains usable after resize`);
  } finally {
    await moduleWindow.evaluate('window.close()');
    moduleWindow.close();
  }
  await waitForTargets((items) => items.length === 1 ? items : null, `${moduleId} module close`);
}

(async () => {
  const app = spawn(electron, [root, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });
  let main;
  let simulator;
  try {
    const initialPages = await waitForTargets((pages) => pages.length === 1 ? pages : null, 'production main window');
    main = new Cdp(initialPages[0].webSocketDebuggerUrl);
    await waitForEval(main, "document.querySelector('#backendState')?.textContent.includes('已连接')", 'production backend connection');
    await waitForEval(main, "document.querySelector('#page-terminal')?.classList.contains('active') && !document.querySelector('.app-toolbar') && !document.querySelector('.metrics-grid') && getComputedStyle(document.querySelector('#pageEyebrow')).display === 'none'", 'main restores the focused terminal workspace without redundant controls');
    if (await main.evaluate("Boolean(document.querySelector('#page-terminal .connection-panel'))")) {
      throw new Error('serial settings panel is still present on the main terminal page');
    }
    await main.evaluate("window.serialScope.openModuleWindow('serial-config')");
    const configPages = await waitForTargets((pages) => pages.length === 2 ? pages : null, 'serial configuration window');
    const configTarget = configPages.find((page) => page.id !== initialPages[0].id);
    const configWindow = new Cdp(configTarget.webSocketDebuggerUrl);
    await waitForEval(configWindow, "document.body?.classList.contains('serial-config-window') && document.querySelector('#page-serial-config')?.classList.contains('active') && document.querySelector('#backendState')?.textContent.includes('已连接') && document.querySelector('.app-sidebar') && !document.querySelector('.app-toolbar') && !document.querySelector('.metrics-grid') && getComputedStyle(document.querySelector('.app-sidebar')).display === 'none'", 'minimal serial configuration module load');
    await resizeWindow(configWindow, 700, 820, 'serial-config');
    await configWindow.evaluate(`(() => {
      document.querySelector('#portSelect').value = 'COM11';
      document.querySelector('#baudRateSelect').value = '9600';
      document.querySelector('#openButton').click();
    })()`);
    await waitForEval(configWindow, "document.querySelector('#configSerialState')?.textContent.includes('已打开')", 'configuration window COM11 open');
    await waitForEval(main, "document.querySelector('#serialState')?.textContent.includes('已打开')", 'main receives configured serial state');
    await waitForEval(main, "document.querySelector('#portSelect')?.value === 'COM11' && document.querySelector('#baudRateSelect')?.value === '9600'", 'serial draft synchronizes to main');
    await configWindow.evaluate('window.close()');
    configWindow.close();
    await waitForTargets((pages) => pages.length === 1 ? pages : null, 'serial configuration window close');
    await main.evaluate(`(() => {
      document.querySelector('#simulatorEnabledCheck').checked = true;
      document.querySelector('#simulatorBuiltinSelect').value = 'none';
      document.querySelector('#addSimulatorRuleButton').click();
      document.querySelector('.simulator-match').value = '41 42';
      document.querySelector('.simulator-response').value = 'CA FE';
      document.querySelector('#saveSimulatorButton').click();
    })()`);
    await waitForEval(main, "document.querySelector('#simulatorStatus')?.textContent.includes('本窗口应答')", 'main simulator ownership');

    await main.evaluate("window.serialScope.openModuleWindow('simulator')");
    const pagesWithSimulator = await waitForTargets((pages) => pages.length === 2 ? pages : null, 'production simulator window');
    const simulatorTarget = pagesWithSimulator.find((page) => page.id !== initialPages[0].id);
    simulator = new Cdp(simulatorTarget.webSocketDebuggerUrl);
    await waitForEval(simulator, "document.querySelector('#page-simulator')?.classList.contains('active') && document.querySelector('#backendState')?.textContent.includes('已连接')", 'simulator module load');
    await resizeWindow(simulator, 1040, 700, 'simulator');
    await waitForEval(main, "document.querySelector('#simulatorStatus')?.textContent.includes('独立模拟窗口应答')", 'main relinquishes simulator ownership');
    await waitForEval(simulator, "document.querySelector('#simulatorStatus')?.textContent.includes('本窗口应答')", 'simulator module ownership');
    if (await helper(roundTrip, ['COM10', '41 42', 'CA FE']) !== 'CA FE') throw new Error('independent simulator reply mismatch');

    await simulator.evaluate('window.close()');
    simulator.close();
    simulator = null;
    await waitForTargets((pages) => pages.length === 1 ? pages : null, 'simulator module close');
    await waitForEval(main, "document.querySelector('#simulatorStatus')?.textContent.includes('本窗口应答')", 'main ownership restored');
    if (await helper(roundTrip, ['COM10', '41 42', 'CA FE']) !== 'CA FE') throw new Error('main simulator reply mismatch after restore');
    await openAndVerifyModule(main, initialPages[0].id, 'terminal', "document.querySelector('#page-terminal')?.classList.contains('active') && document.querySelector('#portSelect') && document.querySelector('#backendState')?.textContent.includes('已连接')", { width: 1050, height: 760 });
    await openAndVerifyModule(main, initialPages[0].id, 'serial-config', "document.querySelector('#page-serial-config')?.classList.contains('active') && document.querySelector('#portSelect') && document.querySelector('#backendState')?.textContent.includes('已连接') && getComputedStyle(document.querySelector('.app-sidebar')).display === 'none'", { width: 700, height: 820 });
    await openAndVerifyModule(main, initialPages[0].id, 'trend', "document.querySelector('#page-trend')?.classList.contains('active') && document.querySelector('#rateCanvas') && document.querySelector('#backendState')?.textContent.includes('已连接')", { width: 1120, height: 720 });
    await openAndVerifyModule(main, initialPages[0].id, 'rules', "document.querySelector('#page-rules')?.classList.contains('active') && document.querySelector('#ruleListPage') && document.querySelector('#backendState')?.textContent.includes('已连接')", { width: 980, height: 680 });
    await openAndVerifyModule(main, initialPages[0].id, 'macros', "document.querySelector('#page-macros')?.classList.contains('active') && document.querySelector('#macroGrid') && document.querySelector('#macroNameInput') && document.querySelector('#backendState')?.textContent.includes('已连接')", { width: 1080, height: 740 });
    console.log('Production Main module windows, simulator ownership and single-reply integration passed');
  } finally {
    simulator?.close();
    main?.close();
    app.kill();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
