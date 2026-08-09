const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const electron = [
  path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
].find((candidate) => fs.existsSync(candidate));
const responder = path.join(root, 'backend', 'build', 'serialscope-virtual-serial-responder.exe');
if (!electron || !fs.existsSync(responder)) throw new Error('未找到 Electron 或虚拟串口应答器。请先运行 npm run build:backend。');

const debugPort = 9800 + Math.floor(Math.random() * 100);
const profile = path.join(root, 'artifacts', `electron-auto-query-${process.pid}`);
fs.rmSync(profile, { recursive: true, force: true });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function endpoint(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${debugPort}${pathname}`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    }).on('error', reject);
  });
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
    await this.ready;
    const id = this.nextId++;
    const result = await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(expression, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const pages = (await endpoint('/json/list')).filter((item) => item.type === 'page');
      if (pages.length === 1) {
        const page = new Cdp(pages[0].webSocketDebuggerUrl);
        if (await page.evaluate(expression)) return page;
        page.close();
      }
    } catch {
      // Electron has not exposed the debugging endpoint yet.
    }
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}

function runResponder() {
  const child = spawn(responder, ['COM10', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return {
    child,
    done: new Promise((resolve, reject) => child.on('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`responder failed (${code}): ${stderr || stdout}`));
    }))
  };
}

(async () => {
  const app = spawn(electron, [root, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`], { cwd: root, stdio: 'ignore' });
  let page;
  try {
    page = await waitFor("document.querySelector('#backendState')?.textContent.includes('已连接')", 'production backend connection');
    await page.evaluate(`window.serialScope.callBackend('serial.open', { portName: 'COM11', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } })`);
    const responderRun = runResponder();
    await page.evaluate(`(() => {
      document.querySelector('#sendModeSelect').value = 'hex';
      document.querySelector('#sendInput').value = '01 03 00 00 00 02 C4 0B';
      document.querySelector('#autoSendInterval').value = '10';
      document.querySelector('#autoSendTimeout').value = '500';
      const enabled = document.querySelector('#autoSendCheck');
      enabled.checked = true;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    let maxInFlight = 0;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      maxInFlight = Math.max(maxInFlight, Number(await page.evaluate("document.querySelector('#autoSendStatus').dataset.inflight")));
      if (Number(await page.evaluate("document.querySelector('#rxFrameSummary').textContent")) >= 20) break;
      await delay(5);
    }
    await page.evaluate(`(() => { const enabled = document.querySelector('#autoSendCheck'); enabled.checked = false; enabled.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    if (maxInFlight > 1) throw new Error(`automatic query accumulated ${maxInFlight} in-flight requests`);
    await delay(300);
    const received = Number(await page.evaluate("document.querySelector('#rxFrameSummary').textContent"));
    const sent = Number(await page.evaluate("document.querySelector('#txFrameSummary').textContent"));
    if (received < 20) throw new Error(`automatic query did not complete at least 20 responses (got ${received})`);
    if (sent !== received) throw new Error(`automatic query did not drain after stop (${sent} TX / ${received} RX)`);
    const answered = Number(await responderRun.done);
    if (answered !== sent) throw new Error(`responder count mismatch (${answered} responses / ${sent} TX)`);
    console.log('Automatic 10 ms query single-in-flight timing integration passed');
  } finally {
    // The until-idle responder normally exits after the final serial read timeout.
    page?.close();
    app.kill();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* Electron may release its profile after process exit. */ }
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
