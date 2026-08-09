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

const debugPort = 9700 + Math.floor(Math.random() * 100);
const profile = path.join(root, 'artifacts', `electron-auto-query-backpressure-${process.pid}`);
fs.rmSync(profile, { recursive: true, force: true });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function pages() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${debugPort}/json/list`, (response) => {
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

async function waitForPage() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const targets = (await pages()).filter((target) => target.type === 'page');
      if (targets.length === 1) return new Cdp(targets[0].webSocketDebuggerUrl);
    } catch { /* Electron still starting. */ }
    await delay(50);
  }
  throw new Error('Timed out waiting for Electron page');
}

(async () => {
  const app = spawn(electron, [root, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`], { cwd: root, stdio: 'ignore' });
  let page;
  try {
    page = await waitForPage();
    const connectionDeadline = Date.now() + 10000;
    while (Date.now() < connectionDeadline) {
      if (await page.evaluate("document.querySelector('#backendState')?.textContent.includes('已连接')")) break;
      await delay(50);
    }
    if (!await page.evaluate("document.querySelector('#backendState')?.textContent.includes('已连接')")) {
      throw new Error('production backend did not connect');
    }
    const result = await page.evaluate(`(async () => {
      await new Promise((resolve, reject) => {
        document.querySelector('#portSelect').value = 'COM11';
        document.querySelector('#baudRateSelect').value = '9600';
        document.querySelector('#openButton').click();
        const deadline = Date.now() + 5000;
        const check = () => {
          if (document.querySelector('#serialState').textContent.includes('已打开')) return resolve();
          if (Date.now() >= deadline) return reject(new Error('failed to open COM11 for UI timing test'));
          setTimeout(check, 25);
        };
        check();
      });
      document.querySelector('#sendModeSelect').value = 'hex';
      document.querySelector('#sendInput').value = 'DE AD BE EF';
      document.querySelector('#autoSendInterval').value = '10';
      document.querySelector('#autoSendTimeout').value = '30';
      const enabled = document.querySelector('#autoSendCheck');
      enabled.checked = true;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));
      let maxInFlight = 0;
      const sampleUntil = Date.now() + 180;
      while (Date.now() < sampleUntil) {
        maxInFlight = Math.max(maxInFlight, Number(document.querySelector('#autoSendStatus').dataset.inflight));
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      const duringWait = {
        tx: Number(document.querySelector('#txFrameSummary').textContent),
        rx: Number(document.querySelector('#rxFrameSummary').textContent),
        maxInFlight,
        inFlight: Number(document.querySelector('#autoSendStatus').dataset.inflight),
        text: document.querySelector('#autoSendStatus').textContent
      };
      enabled.checked = false;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));
      return duringWait;
    })()`);
    if (result.tx < 2 || result.rx !== 0 || result.maxInFlight > 1 || result.inFlight > 1) throw new Error(`automatic query backpressure failed: ${JSON.stringify(result)}`);
    console.log('Automatic 10 ms query backpressure UI integration passed');
  } finally {
    page?.close();
    app.kill();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* Electron may release its profile after process exit. */ }
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
