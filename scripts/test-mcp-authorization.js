// MCP 授权逻辑测试（不依赖虚拟串口）。
// 验证 McpBridge 端口白名单拒绝、方法白名单拒绝、read_data 快照、白名单持久化。
const path = require('path');
const os = require('os');
const fs = require('fs');
const { McpBridge } = require('../src/main/mcp-bridge');

function mockRpc() {
  const calls = [];
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params });
      return { ok: true, method };
    }
  };
}

function callTool(bridge, tool, params) {
  return new Promise((resolve, reject) => {
    const callId = `test-${Date.now()}-${Math.random()}`;
    const capture = { send: (msg) => {
      if (msg.type !== 'mcp-tool-result' || msg.callId !== callId) return;
      bridge.child = undefined;
      msg.ok ? resolve(msg.result) : reject(Object.assign(new Error(msg.error || 'tool failed'), { mcpCode: msg.errorCode }));
    } };
    bridge.child = capture;
    bridge._handleChildMessage({ type: 'mcp-tool-call', callId, tool, params });
  });
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-mcp-auth-'));
  try {
    const rpc = mockRpc();
    const allowedRpcMethods = new Set(['ports.list', 'serial.send']);
    const bridge = new McpBridge({ backendRpc: rpc, allowedRpcMethods, userDataPath: userData });
    bridge.setAllowedPorts(['COM10']);

    // 1. 白名单外端口写被拒
    let denied = false;
    try {
      await callTool(bridge, 'send_data', { port: 'COM5', hex: 'AA' });
    } catch (e) {
      denied = e.mcpCode === -32002 && e.message.includes('白名单');
    }
    if (!denied) throw new Error('white-list outside port should be denied');

    // 2. 白名单内端口放行，映射到 serial.send
    await callTool(bridge, 'send_data', { port: 'COM10', hex: 'AA 55' });
    const sendCall = rpc.calls.find((c) => c.method === 'serial.send');
    if (!sendCall || sendCall.params.data !== 'AA 55') throw new Error('send_data did not map to serial.send hex');

    // 3. 方法白名单外（open_connection 不在 allowedRpcMethods）被拒
    denied = false;
    try {
      await callTool(bridge, 'open_connection', { port: 'COM10', baudRate: 9600 });
    } catch (e) {
      denied = e.mcpCode === -32001;
    }
    if (!denied) throw new Error('method outside allowedRpcMethods should be denied');

    // 4. read_data 快照（先 append 帧）
    bridge.appendRxFrame({ hex: 'AA 55', text: '..' });
    bridge.appendRxFrame({ hex: 'BB 01', text: '..' });
    const frames = await callTool(bridge, 'read_data', { count: 1 });
    if (!Array.isArray(frames.frames) || frames.frames.length !== 1 || frames.frames[0].hex !== 'BB 01') {
      throw new Error(`read_data snapshot mismatch: ${JSON.stringify(frames)}`);
    }

    // 5. 端口白名单持久化（重启加载）
    bridge.setAllowedPorts(['COM11']);
    const bridge2 = new McpBridge({ backendRpc: mockRpc(), allowedRpcMethods, userDataPath: userData });
    const ports = bridge2.getAllowedPorts();
    if (ports.length !== 1 || ports[0] !== 'COM11') throw new Error(`white-list persistence failed: ${JSON.stringify(ports)}`);

    // 6. send_data 无 payload 被拒（COM11 在白名单，但缺 payload）
    denied = false;
    let gotCode = null;
    let gotMsg = '';
    try {
      await callTool(bridge, 'send_data', { port: 'COM11' });
    } catch (e) {
      gotCode = e.mcpCode;
      gotMsg = e.message;
      denied = e.mcpCode === -32602;
    }
    if (!denied) throw new Error(`send_data without payload should be rejected (got code=${gotCode} msg=${gotMsg})`);

    console.log('MCP authorization passed');
  } finally {
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
