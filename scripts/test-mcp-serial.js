// MCP 串口端到端测试：COM10/COM11 虚拟串口对。
// 验证 McpBridge 端口白名单授权 + send_data 经 COM10 发送、COM11 读回。
// 需要 ELTIMA 虚拟串口对 COM10/COM11 存在。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');
const { McpBridge } = require('../src/main/mcp-bridge');

const backendPath = path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe');
const writerPath = path.join(__dirname, '..', 'backend', 'build', 'serialscope-virtual-serial-writer.exe');
const readerPath = path.join(__dirname, '..', 'backend', 'build', 'serialscope-virtual-serial-reader.exe');

function runHelper(executable, args) {
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
  child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(executable)} failed (${code}): ${stderr || stdout}`)));
  });
}

async function main() {
  const pipeName = `\\\\.\\pipe\\SerialScope.Native.mcp-test-${process.pid}-${Date.now()}`;
  const backend = spawn(backendPath, ['--pipe', pipeName], { stdio: ['ignore', 'ignore', 'pipe'] });
  const allowedRpcMethods = new Set(['ports.list', 'serial.status', 'serial.open', 'serial.close', 'serial.send']);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-mcp-test-'));
  try {
    const rpc = new NamedPipeRpcClient();
    await rpc.connect(pipeName);
    await rpc.call('backend.ping');
    const bridge = new McpBridge({ backendRpc: rpc, allowedRpcMethods, userDataPath: userData });

    // 1. 打开 COM10（需先加入白名单，否则 open 被拒）
    bridge.setAllowedPorts(['COM10']);

    // 用 simulate child message 触发工具调用，捕获回传结果
    function callTool(tool, params) {
      return new Promise((resolve, reject) => {
        const callId = `test-${Date.now()}-${Math.random()}`;
        const capture = { send: (msg) => {
          if (msg.type !== 'mcp-tool-result' || msg.callId !== callId) return;
          bridge.child = undefined; // 解除模拟
          msg.ok ? resolve(msg.result) : reject(new Error(`${msg.error || ''} (code ${msg.errorCode})`));
        } };
        bridge.child = capture;
        bridge._handleChildMessage({ type: 'mcp-tool-call', callId, tool, params });
      });
    }

    // 2. 白名单外端口 open 被拒
    let denied = false;
    try {
      await callTool('open_connection', { port: 'COM5', baudRate: 9600 });
    } catch (e) {
      denied = e.message.includes('不在 MCP 白名单');
    }
    if (!denied) throw new Error('white-list outside port should be denied');

    // 3. open COM10
    await callTool('open_connection', { port: 'COM10', baudRate: 9600 });

    // 4. send_data 到 COM10，COM11 读回
    const reader = runHelper(readerPath, ['COM11']);
    await new Promise((r) => setTimeout(r, 150));
    await callTool('send_data', { port: 'COM10', hex: 'AA 55' });
    const received = await reader;
    if (received !== 'AA 55') throw new Error(`COM11 did not receive 'AA 55', got '${received}'`);

    console.log('MCP serial integration passed');
  } finally {
    backend.kill();
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
