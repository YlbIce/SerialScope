// MCP 授权逻辑测试（不依赖虚拟串口）。
// 验证 McpBridge 端口白名单拒绝、方法白名单拒绝、read_data 快照、白名单持久化、P1 会话隔离。
const path = require('path');
const os = require('os');
const fs = require('fs');
const { McpBridge } = require('../src/main/mcp-bridge');

// 可配置的 mock RPC：serial.status 返回指定状态。
function mockRpc(statusOverride) {
  const calls = [];
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params });
      if (method === 'serial.status' && statusOverride) return statusOverride;
      if (method === 'serial.status') return { isOpen: false, portName: '' };
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

async function expectRejected(bridge, tool, params, expectedCode, label) {
  let denied = false;
  let gotCode = null;
  let gotMsg = '';
  try {
    await callTool(bridge, tool, params);
  } catch (e) {
    gotCode = e.mcpCode;
    gotMsg = e.message;
    denied = e.mcpCode === expectedCode;
  }
  if (!denied) throw new Error(`${label} should be rejected with ${expectedCode} (got code=${gotCode} msg=${gotMsg})`);
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-mcp-auth-'));
  try {
    const allowedFull = new Set(['ports.list', 'serial.status', 'serial.send', 'serial.open']);
    const allowedNoOpen = new Set(['ports.list', 'serial.status', 'serial.send']);

    // 场景 1：方法白名单外（open_connection 需 serial.open，但 allowedNoOpen 不含）
    const rpc0 = mockRpc();
    const bridge0 = new McpBridge({ backendRpc: rpc0, allowedRpcMethods: allowedNoOpen, userDataPath: userData });
    bridge0.setAllowedPorts(['COM10']);
    await expectRejected(bridge0, 'open_connection', { port: 'COM10', baudRate: 9600 }, -32001, 'method outside allowedRpcMethods');

    // 场景 2：白名单内 send_data 映射到 serial.send
    const rpc1 = mockRpc();
    const bridge = new McpBridge({ backendRpc: rpc1, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridge.setAllowedPorts(['COM10']);
    await expectRejected(bridge, 'send_data', { port: 'COM5', hex: 'AA' }, -32002, 'white-list outside port');
    await callTool(bridge, 'send_data', { port: 'COM10', hex: 'AA 55' });
    const sendCall = rpc1.calls.find((c) => c.method === 'serial.send');
    if (!sendCall || sendCall.params.data !== 'AA 55') throw new Error('send_data did not map to serial.send hex');

    // read_data 快照
    bridge.appendRxFrame({ hex: 'AA 55', text: '..' });
    bridge.appendRxFrame({ hex: 'BB 01', text: '..' });
    const frames = await callTool(bridge, 'read_data', { count: 1 });
    if (!Array.isArray(frames.frames) || frames.frames.length !== 1 || frames.frames[0].hex !== 'BB 01') {
      throw new Error(`read_data snapshot mismatch: ${JSON.stringify(frames)}`);
    }

    // 端口白名单持久化
    bridge.setAllowedPorts(['COM11']);
    const bridge2 = new McpBridge({ backendRpc: mockRpc(), allowedRpcMethods: allowedFull, userDataPath: userData });
    const ports = bridge2.getAllowedPorts();
    if (ports.length !== 1 || ports[0] !== 'COM11') throw new Error(`white-list persistence failed: ${JSON.stringify(ports)}`);

    // send_data 无 payload 被拒
    await expectRejected(bridge, 'send_data', { port: 'COM11' }, -32602, 'send_data without payload');

    // ---- P1 会话隔离 ----
    // 场景 3：主界面已打开 COM20（不同端口），MCP open COM10 应被拒（-32003）
    const rpcBusy = mockRpc({ isOpen: true, portName: 'COM20' });
    const bridgeBusy = new McpBridge({ backendRpc: rpcBusy, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridgeBusy.setAllowedPorts(['COM10', 'COM20']);
    await expectRejected(bridgeBusy, 'open_connection', { port: 'COM10', baudRate: 9600 }, -32003, 'MCP steal session (COM10 while COM20 open)');

    // 场景 4：主界面已打开 COM10（同一端口），MCP open COM10 应放行（不抢占同端口）
    const rpcSame = mockRpc({ isOpen: true, portName: 'COM10' });
    const bridgeSame = new McpBridge({ backendRpc: rpcSame, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridgeSame.setAllowedPorts(['COM10']);
    await callTool(bridgeSame, 'open_connection', { port: 'COM10', baudRate: 9600 });
    const openSameCall = rpcSame.calls.find((c) => c.method === 'serial.open');
    if (!openSameCall || openSameCall.params.portName !== 'COM10') throw new Error('MCP open same port should be allowed');

    // 场景 5：主界面未打开串口，MCP open COM10 应放行
    const rpcFree = mockRpc();
    const bridgeFree = new McpBridge({ backendRpc: rpcFree, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridgeFree.setAllowedPorts(['COM10']);
    await callTool(bridgeFree, 'open_connection', { port: 'COM10', baudRate: 9600 });
    const openFreeCall = rpcFree.calls.find((c) => c.method === 'serial.open');
    if (!openFreeCall || openFreeCall.params.portName !== 'COM10') throw new Error('MCP open free port should be allowed');

    // 场景 6：configure_connection 在已有不同端口会话时应被拒
    const rpcCfg = mockRpc({ isOpen: true, portName: 'COM20' });
    const bridgeCfg = new McpBridge({ backendRpc: rpcCfg, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridgeCfg.setAllowedPorts(['COM10', 'COM20']);
    await expectRejected(bridgeCfg, 'configure_connection', { port: 'COM10', baudRate: 9600 }, -32003, 'MCP configure steal session');

    // ---- P2 ----
    // 场景 7：open 后 currentPort 记录，read_data 指定同端口返回快照
    const rpcP2 = mockRpc({ isOpen: false, portName: '' });
    const bridgeP2 = new McpBridge({ backendRpc: rpcP2, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridgeP2.setAllowedPorts(['COM10']);
    await callTool(bridgeP2, 'open_connection', { port: 'COM10', baudRate: 9600 });
    if (bridgeP2.currentPort !== 'COM10') throw new Error(`currentPort should be COM10, got ${bridgeP2.currentPort}`);
    bridgeP2.appendRxFrame({ hex: 'AA 55', text: '..' });
    const samePortFrames = await callTool(bridgeP2, 'read_data', { count: 10, port: 'COM10' });
    if (samePortFrames.frames.length !== 1) throw new Error('read_data same port should return frames');

    // 场景 8：read_data 指定不匹配端口返回空（端口隔离）
    const otherPortFrames = await callTool(bridgeP2, 'read_data', { count: 10, port: 'COM20' });
    if (!Array.isArray(otherPortFrames.frames) || otherPortFrames.frames.length !== 0) {
      throw new Error('read_data mismatched port should return empty');
    }

    // 场景 9：send_and_expect 等待新 RX（发送后异步 append，应返回新增帧）
    const rpcExpect = mockRpc({ isOpen: true, portName: 'COM10' });
    const bridgeExpect = new McpBridge({ backendRpc: rpcExpect, allowedRpcMethods: allowedFull, userDataPath: userData });
    bridgeExpect.setAllowedPorts(['COM10']);
    bridgeExpect.appendRxFrame({ hex: 'OLD', text: '..' });
    // 发送后 60ms 追加新 RX
    setTimeout(() => bridgeExpect.appendRxFrame({ hex: 'NEW', text: '..' }), 60);
    const expectResult = await callTool(bridgeExpect, 'send_and_expect', { port: 'COM10', hex: 'AA', timeoutMs: 1000 });
    if (!Array.isArray(expectResult.frames) || expectResult.frames.length !== 1 || expectResult.frames[0].hex !== 'NEW') {
      throw new Error(`send_and_expect should return new RX frames, got ${JSON.stringify(expectResult)}`);
    }

    console.log('MCP authorization passed');
  } finally {
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
