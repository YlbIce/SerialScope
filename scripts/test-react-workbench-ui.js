const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, 'react-workbench-ui-profile');
let window;
const savedFiles = [];

fs.mkdirSync(artifacts, { recursive: true });
fs.rmSync(profile, { recursive: true, force: true });
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
protocol.registerSchemesAsPrivileged([{ scheme: 'serialscope', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(expression, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!window.isDestroyed() && await window.webContents.executeJavaScript(expression, true)) return;
    await delay(50);
  }
  throw new Error(`UI 超时：${description}`);
}

app.whenReady().then(async () => {
  try {
    const rendererRoot = path.join(root, 'src', 'renderer-dist');
    protocol.handle('serialscope', (request) => {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const requested = path.resolve(rendererRoot, `.${pathname || '/index.html'}`);
      return net.fetch(pathToFileURL(requested).toString());
    });
    ipcMain.handle('backend:start', () => ({ started: true, message: '测试后端已连接' }));
    ipcMain.handle('workbench:beginExecution', () => ({ target: 'simulation', portName: 'COM11' }));
    ipcMain.handle('workbench:endExecution', () => ({ ended: true }));
    ipcMain.handle('backend:rpc', (_event, method) => {
      if (method === 'serial.status') return { isOpen: false, portName: '' };
      if (method === 'serial.send') return { ok: true };
      throw new Error(`测试未实现 RPC：${method}`);
    });
    ipcMain.handle('window:openModule', () => ({ opened: true }));
    ipcMain.handle('file:saveText', (_event, options) => { savedFiles.push(options); return { canceled: false }; });
    ipcMain.handle('file:openJson', () => ({ canceled: true }));

    window = new BrowserWindow({
      width: 1180,
      height: 820,
      show: true,
      backgroundColor: '#101215',
      webPreferences: {
        preload: path.join(root, 'src', 'main', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    window.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      console.error(`renderer console ${sourceId}:${line}: ${message}`);
    });
    window.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error(`renderer load failed ${code}: ${description} (${url})`);
    });
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`preload failed ${preloadPath}: ${error.stack || error}`);
    });
    await window.loadURL('serialscope://workbench/index.html');
    await waitFor("document.querySelector('.react-flow') && document.querySelector('h2')?.textContent === '通信测试工作台'", 'React Flow 工作台加载');
    await window.webContents.executeJavaScript("document.querySelector('.react-flow__node[data-id=\"condition\"]').click()", true);
    await waitFor("document.querySelector('.inspector')?.textContent.includes('condition · condition')", '条件节点检查器打开');
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('.inspector select'); select.value = 'modbusRegister'; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true);
    await waitFor("document.querySelector('.inspector')?.textContent.includes('读取起始地址')", 'Modbus 寄存器字段显示');
    await window.webContents.executeJavaScript(`(() => {
      const set = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
      const selects = Array.from(document.querySelectorAll('.inspector select'));
      selects[1].value = '4'; selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      selects[2].value = 'int16be'; selects[2].dispatchEvent(new Event('change', { bubbles: true }));
      const inputs = Array.from(document.querySelectorAll('.inspector input'));
      set(inputs[1], '1'); set(inputs[2], '5'); set(inputs[3], '6'); set(inputs[4], '100');
    })()`, true);
    try {
      await waitFor("(() => { const data = JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2')).nodes.find((node) => node.id === 'condition')?.data; return data?.label === '条件：Modbus 寄存器' && data?.conditionType === 'modbusRegister' && data?.operator === 'equals' && data?.modbusUnit === 1 && data?.modbusFunction === 4 && data?.fieldType === 'int16be' && data?.modbusStartAddress === 5 && data?.modbusRegisterAddress === 6 && data?.expected === '100'; })()", 'Modbus 寄存器条件配置持久化');
    } catch (error) {
      throw new Error(`${error.message}：${await window.webContents.executeJavaScript("JSON.stringify(JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2')).nodes.find((node) => node.id === 'condition')?.data)", true)}`);
    }
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.inspector input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '条件：温度达到上限'); input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`, true);
    await waitFor("JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2')).nodes.find((node) => node.id === 'condition')?.data?.label === '条件：温度达到上限'", '自定义条件名称保存');
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('.inspector select'); select.value = 'byteField'; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true);
    await waitFor("(() => { const data = JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2')).nodes.find((node) => node.id === 'condition')?.data; return data?.conditionType === 'byteField' && data?.label === '条件：温度达到上限'; })()", '切换类型不覆盖自定义条件名称');
    await window.webContents.executeJavaScript("document.querySelector('.react-flow__node[data-id=\"query\"]').click()", true);
    await waitFor("document.querySelector('.inspector')?.textContent.includes('引用宏库')", '切回宏节点检查器');
    await window.webContents.executeJavaScript(`(() => {
      const inputs = Array.from(document.querySelectorAll('.palette input'));
      const set = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
      set(inputs[2], 'UI 规则命中');
      set(inputs[3], '^CA\\\\s*FE');
      Array.from(document.querySelectorAll('.palette button')).find((button) => button.textContent === '保存规则').click();
    })()`, true);
    await waitFor("document.querySelector('.palette')?.textContent.includes('UI 规则命中')", '工作台规则保存');
    window.webContents.send('backend:rpc-notification', { method: 'serial.rx', params: { sequence: 7, timestamp: Date.now(), hex: 'CA FE', text: '' } });
    await waitFor("document.querySelector('.execution-log')?.textContent.includes('规则：UI 规则命中')", 'RX 规则命中写入工作台');
    await window.webContents.executeJavaScript(`(() => {
      const inputs = Array.from(document.querySelectorAll('.palette input'));
      const set = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
      set(inputs[0], 'UI 查询宏'); set(inputs[1], '01 03 00 00 00 01');
      Array.from(document.querySelectorAll('.palette button')).find((button) => button.textContent === '保存宏').click();
    })()`, true);
    await waitFor("JSON.parse(localStorage.getItem('serialscope.device-workbench.macros.v1') || '[]').some((item) => item.name === 'UI 查询宏' && item.id && item.revision >= 1)", '宏 ID 与版本保存');
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('.inspector select');
      const option = Array.from(select.options).find((item) => item.textContent.includes('UI 查询宏'));
      select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true);
    await waitFor("JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2')).nodes.find((node) => node.id === 'query')?.data?.macroId?.startsWith('macro-')", '宏节点切换为宏库 ID');
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('.inspector select');
      select.value = 'builtin-read-registers'; select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true);
    await waitFor("JSON.parse(localStorage.getItem('serialscope.device-workbench.flow.v2')).nodes.find((node) => node.id === 'query')?.data?.macroId === 'builtin-read-registers'", '宏节点切回内置宏');
    const before = await window.webContents.executeJavaScript("document.querySelectorAll('.react-flow__node').length", true);
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.palette button')).find((button) => button.textContent.includes('循环：受限重试')).click()", true);
    await waitFor(`document.querySelectorAll('.react-flow__node').length === ${before + 1}`, '循环节点加入画布');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('执行流程')).click()", true);
    await waitFor("document.querySelector('.run')?.textContent.includes('waiting')", '读取节点等待报文');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('取消执行')).click()", true);
    await waitFor("document.querySelector('.run')?.textContent.includes('cancelled')", '用户取消流程后收敛');
    await waitFor("(() => { const report = JSON.parse(localStorage.getItem('serialscope.device-workbench.reports.v1') || '[]')[0]; return report?.macroSnapshot?.length === 1 && report.macroSnapshot[0].id === 'builtin-read-registers'; })()", '报告只快照实际执行的宏');
    await waitFor("!Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('执行流程')).disabled", '取消后执行器收敛');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('执行流程')).click()", true);
    await waitFor("document.querySelector('.run')?.textContent.includes('failed')", '已发送宏后读取超时失败');
    await waitFor("(() => { const report = JSON.parse(localStorage.getItem('serialscope.device-workbench.reports.v1') || '[]')[0]; return report?.result === 'failed' && report?.macroSnapshot?.length === 1 && report.macroSnapshot[0].id === 'builtin-read-registers'; })()", '失败报告保留此前成功宏');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('保存为新版本')).click()", true);
    await waitFor("document.querySelector('.execution-log')?.textContent.includes('v2')", '用例版本保存');
    await waitFor("JSON.parse(localStorage.getItem('serialscope.device-workbench.flow-versions.v1') || '[]').some((item) => item.revision === 2 && item.nodes?.length)", '用例版本快照保存');
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.inspector input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '仅用于验证重放'); input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`, true);
    await waitFor("document.querySelector('.react-flow')?.textContent.includes('仅用于验证重放')", '报告后流程变更');
    await window.webContents.executeJavaScript(`(() => {
      const button = Array.from(document.querySelectorAll('.execution-log button')).find((item) => item.textContent.includes('重放报告'));
      if (button) button.click();
    })()`, true);
    await waitFor("document.querySelector('.run')?.textContent.includes('replay')", '报告用例重放');
    await waitFor("!document.querySelector('.react-flow')?.textContent.includes('仅用于验证重放')", '报告流程快照覆盖后续变更');
    await window.webContents.executeJavaScript("['导出 JSON', '导出 CSV', '导出 HTML'].forEach((label) => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === label).click())", true);
    await delay(100);
    if (savedFiles.length !== 3) throw new Error(`报告导出次数错误：${savedFiles.length}`);
    const json = savedFiles.find((item) => item.defaultPath.endsWith('.json'));
    const csv = savedFiles.find((item) => item.defaultPath.endsWith('.csv'));
    const html = savedFiles.find((item) => item.defaultPath.endsWith('.html'));
    if (!json || !csv || !html || !csv.content.includes('"type","sequence"') || !html.content.includes('步骤')) {
      throw new Error(`报告导出格式不完整：${savedFiles.map((item) => `${item.defaultPath} (${String(item.content).slice(0, 24)})`).join(' | ')}`);
    }
    await window.webContents.executeJavaScript(`(() => {
      localStorage.setItem('serialscope.device-workbench.flow.v2', JSON.stringify({ revision: 9, nodes: [
        { id: 'start', type: 'flow', position: { x: 0, y: 0 }, data: { kind: 'start', label: '开始' } },
        { id: 'legacy', type: 'flow', position: { x: 150, y: 0 }, data: { kind: 'macro', label: '宏：遗留内联', hex: 'AA' } },
        { id: 'end', type: 'flow', position: { x: 300, y: 0 }, data: { kind: 'end', label: '结束' } }
      ], edges: [{ id: 'a', source: 'start', target: 'legacy' }, { id: 'b', source: 'legacy', target: 'end' }] }));
      location.reload();
    })()`, true);
    await waitFor("document.querySelector('.react-flow')?.textContent.includes('写入：遗留内联') && document.querySelector('.react-flow')?.textContent.includes('write')", '旧内联宏迁移为写入节点');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('执行流程')).click()", true);
    await waitFor("document.querySelector('.run')?.textContent.includes('passed')", '迁移流程可再次执行');
    await waitFor("(() => { const report = JSON.parse(localStorage.getItem('serialscope.device-workbench.reports.v1') || '[]')[0]; return report?.result === 'passed' && Array.isArray(report.macroSnapshot) && report.macroSnapshot.length === 0; })()", '迁移写入不会伪造宏快照');
    window.setSize(1220, 820);
    await delay(150);
    const [width, height] = window.getSize();
    if (width !== 1220 || height !== 820) throw new Error(`工作台窗口缩放失败：${width}x${height}`);
    const screenshot = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifacts, 'react-workbench-ui.png'), screenshot.toPNG());
    console.log('React Flow 通信测试工作台可见 UI 验证通过');
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(artifacts, 'react-workbench-ui-error.txt'), `${error.stack || error}\n`);
    console.error(error.stack || error);
    app.exit(1);
  }
});
