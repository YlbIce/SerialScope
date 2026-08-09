// MCP Server 子进程（stdio 传输）。
// 由 Electron Main 派生；通过 stdin/stdout 与 MCP 客户端（Claude Desktop/Cursor）交互。
// 工具调用不直接访问串口，而是经 ipc channel 转发给 Main，由 Main 复用授权门面处理后回传。
const readline = require('readline');

const TOOLS = [
  {
    name: 'list_ports',
    description: '枚举可用串口（只读）',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'serial.status',
    description: '查询当前串口状态（只读）',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'read_data',
    description: '读取当前会话最近 N 条 RX 帧快照（只读，不阻塞）',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 100, description: '返回条数，默认 10' } },
      additionalProperties: false
    }
  },
  {
    name: 'open_connection',
    description: '打开串口连接（写，需端口在白名单）',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'string' },
        baudRate: { type: 'integer' },
        dataBits: { type: 'integer' },
        stopBits: { type: 'integer' },
        parity: { type: 'string' }
      },
      required: ['port'],
      additionalProperties: false
    }
  },
  {
    name: 'send_data',
    description: '向串口发送数据（写，需端口在白名单）',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'string' },
        data: { type: 'array', items: { type: 'integer' }, description: '字节数组' },
        hex: { type: 'string', description: '或空格分隔的 HEX 字符串' },
        text: { type: 'string', description: '或纯文本' }
      },
      required: ['port'],
      additionalProperties: false
    }
  },
  {
    name: 'send_and_expect',
    description: '发送数据并读取最近 RX 帧（写，需端口在白名单）',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'string' },
        data: { type: 'array', items: { type: 'integer' } },
        hex: { type: 'string' },
        text: { type: 'string' },
        timeoutMs: { type: 'integer' }
      },
      required: ['port'],
      additionalProperties: false
    }
  },
  {
    name: 'configure_connection',
    description: '重配置串口连接参数（写，需端口在白名单）',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'string' },
        baudRate: { type: 'integer' },
        dataBits: { type: 'integer' },
        stopBits: { type: 'integer' },
        parity: { type: 'string' }
      },
      required: ['port'],
      additionalProperties: false
    }
  }
];

const pendingCalls = new Map();
let sequence = 0;

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// 经 ipc channel 请求 Main 处理工具调用。
function forwardToMain(tool, params, id) {
  const callId = `mcp-call-${Date.now()}-${++sequence}`;
  pendingCalls.set(callId, { id, tool, params });
  if (typeof process.send !== 'function') {
    pendingCalls.delete(callId);
    respondError(id, -32000, 'MCP 子进程未绑定 IPC 通道');
    return;
  }
  process.send({ type: 'mcp-tool-call', callId, tool, params });
}

function handleRequest(message) {
  if (message.method === 'initialize') {
    respond(message.id, {
      protocolVersion: message.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'serialscope-mcp', version: '0.1.0' }
    });
    return;
  }
  if (message.method === 'notifications/initialized') {
    return; // 通知，无需响应
  }
  if (message.method === 'tools/list') {
    respond(message.id, { tools: TOOLS });
    return;
  }
  if (message.method === 'tools/call') {
    const params = message.params || {};
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) {
      respondError(message.id, -32602, `未知工具: ${params.name}`);
      return;
    }
    forwardToMain(tool.name, params.arguments || {}, message.id);
    return;
  }
  respondError(message.id, -32601, `方法未找到: ${message.method}`);
}

// 处理 Main 回传的工具调用结果。
process.on('message', (message) => {
  if (!message || message.type !== 'mcp-tool-result') return;
  const pending = pendingCalls.get(message.callId);
  if (!pending) return;
  pendingCalls.delete(message.callId);
  if (message.ok) {
    respond(pending.id, message.result);
  } else {
    respondError(pending.id, message.errorCode || -32000, message.error || '工具调用失败');
  }
});

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  try {
    handleRequest(message);
  } catch (error) {
    if (message && message.id !== undefined) {
      respondError(message.id, -32000, error.message || '内部错误');
    }
  }
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
