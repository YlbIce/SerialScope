// MCP Server stdio 握手与工具发现测试（不依赖虚拟串口）。
// 派生 mcp-server.js，模拟 Main 作为 ipc 父进程回传工具结果。
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const serverPath = path.join(__dirname, '..', 'src', 'main', 'mcp-server.js');
const child = spawn(process.execPath, [serverPath], {
  cwd: path.dirname(serverPath),
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  windowsHide: true
});

const rl = readline.createInterface({ input: child.stdout });
let settled = false;
let pendingToolCall = null;

function finish(error) {
  if (settled) return;
  settled = true;
  child.kill();
  if (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } else {
    console.log('MCP handshake passed');
  }
}

function send(message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

// 模拟 Main 处理工具调用。
child.on('message', (message) => {
  if (message.type !== 'mcp-tool-call') return;
  pendingToolCall = message;
  // list_ports 是只读，模拟返回固定端口。
  child.send({
    type: 'mcp-tool-result',
    callId: message.callId,
    ok: true,
    result: { ports: [{ name: 'COM10' }, { name: 'COM11' }] }
  });
});

let step = 0;
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (step === 0) {
    // 收到 initialize 响应
    if (msg.error) return finish(new Error(`initialize failed: ${JSON.stringify(msg.error)}`));
    if (!msg.result?.serverInfo || !msg.result?.capabilities?.tools) {
      return finish(new Error(`initialize result mismatch: ${JSON.stringify(msg.result)}`));
    }
    step = 1;
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    return;
  }
  if (step === 1) {
    if (msg.error) return finish(new Error(`tools/list failed: ${JSON.stringify(msg.error)}`));
    const tools = msg.result?.tools || [];
    if (tools.length !== 7) return finish(new Error(`expected 7 tools, got ${tools.length}`));
    const names = tools.map((t) => t.name);
    const required = ['list_ports', 'serial.status', 'read_data', 'open_connection', 'send_data', 'send_and_expect', 'configure_connection'];
    if (!required.every((n) => names.includes(n))) return finish(new Error(`missing tools: ${required.filter((n) => !names.includes(n))}`));
    step = 2;
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_ports', arguments: {} } });
    return;
  }
  if (step === 2) {
    if (msg.error) return finish(new Error(`tools/call list_ports failed: ${JSON.stringify(msg.error)}`));
    const ports = msg.result?.ports || [];
    if (ports.length !== 2 || ports[0].name !== 'COM10') {
      return finish(new Error(`list_ports result mismatch: ${JSON.stringify(msg.result)}`));
    }
    // 未知工具应报错
    step = 3;
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } });
    return;
  }
  if (step === 3) {
    if (!msg.error || msg.error.code !== -32602) {
      return finish(new Error(`unknown tool should error: ${JSON.stringify(msg)}`));
    }
    finish();
    return;
  }
});

child.on('error', (error) => finish(error));
setTimeout(() => finish(new Error('MCP handshake test timed out')), 8000).unref();

// 启动握手
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
