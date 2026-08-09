// MCP Server 桥接：Main 侧管理 MCP 子进程、端口白名单、工具转发。
// 工具调用经现有 backendRpc（allowedRpcMethods 白名单）+ 端口白名单授权。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class McpBridge {
  constructor({ backendRpc, allowedRpcMethods, userDataPath }) {
    this.backendRpc = backendRpc;
    this.allowedRpcMethods = allowedRpcMethods;
    this.configPath = path.join(userDataPath, 'mcp-config.json');
    this.allowPorts = [];
    this.child = null;
    this.running = false;
    this.rxBuffer = [];
    this.rxBufferMax = 200;
    this._loadConfig();
  }

  _loadConfig() {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      this.allowPorts = Array.isArray(parsed.allowPorts) ? parsed.allowPorts.filter((p) => typeof p === 'string') : [];
    } catch {
      this.allowPorts = [];
    }
  }

  _persistConfig() {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify({ allowPorts: this.allowPorts }, null, 2), 'utf8');
    } catch (error) {
      console.error('MCP 配置持久化失败:', error.message);
    }
  }

  getAllowedPorts() {
    return [...this.allowPorts];
  }

  setAllowedPorts(ports) {
    this.allowPorts = Array.isArray(ports) ? ports.filter((p) => typeof p === 'string') : [];
    this._persistConfig();
  }

  isAllowedPort(port) {
    return this.allowPorts.includes(port);
  }

  // 追加 RX 帧（read_data 用）。由 main.js 的 serial.rx notification 回调调用。
  appendRxFrame(frame) {
    if (!frame || typeof frame !== 'object') return;
    this.rxBuffer.push(frame);
    if (this.rxBuffer.length > this.rxBufferMax) {
      this.rxBuffer.splice(0, this.rxBuffer.length - this.rxBufferMax);
    }
  }

  getRxFrames(count) {
    const n = Number.isInteger(count) && count > 0 ? Math.min(count, 100) : 10;
    return this.rxBuffer.slice(-n);
  }

  start() {
    if (this.running) return { started: false, message: 'MCP Server 已在运行' };
    const entry = path.join(__dirname, 'mcp-server.js');
    if (!fs.existsSync(entry)) {
      return { started: false, message: 'MCP Server 入口不存在' };
    }
    this.child = spawn(process.execPath, [entry], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });
    this.running = true;
    this.child.on('message', (message) => this._handleChildMessage(message));
    this.child.on('exit', () => {
      this.child = null;
      this.running = false;
    });
    return { started: true, message: 'MCP Server 已启动' };
  }

  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.running = false;
    return { stopped: true };
  }

  isRunning() {
    return this.running;
  }

  _handleChildMessage(message) {
    if (!message || message.type !== 'mcp-tool-call') return;
    const { callId, tool, params } = message;
    let result;
    let errorCode = null;
    let errorMsg = null;
    try {
      result = this._dispatchTool(tool, params);
    } catch (error) {
      errorCode = error.mcpCode || -32000;
      errorMsg = error.message || '工具调用失败';
    }
    if (this.child && typeof this.child.send === 'function') {
      this.child.send({
        type: 'mcp-tool-result',
        callId,
        ok: errorMsg === null,
        result,
        errorCode,
        error: errorMsg
      });
    }
  }

  _requireAllowedPort(port) {
    if (!port || typeof port !== 'string') {
      const err = new Error('缺少端口参数 port');
      err.mcpCode = -32602;
      throw err;
    }
    if (!this.isAllowedPort(port)) {
      const err = new Error(`端口 ${port} 不在 MCP 白名单`);
      err.mcpCode = -32002;
      throw err;
    }
  }

  _dispatchTool(tool, params) {
    switch (tool) {
      case 'list_ports':
        return this._call('ports.list', {});
      case 'serial.status':
        return this._call('serial.status', {});
      case 'read_data':
        return { frames: this.getRxFrames(params.count) };
      case 'open_connection': {
        this._requireAllowedPort(params.port);
        return this._call('serial.open', {
          portName: params.port,
          baudRate: params.baudRate ?? 9600,
          dataBits: params.dataBits ?? 8,
          stopBits: params.stopBits ?? 1,
          parity: params.parity ?? 'none',
          flowControl: 'none'
        });
      }
      case 'send_data': {
        this._requireAllowedPort(params.port);
        const payload = this._toPayload(params);
        return this._call('serial.send', payload);
      }
      case 'send_and_expect': {
        this._requireAllowedPort(params.port);
        const payload = this._toPayload(params);
        this._call('serial.send', payload);
        return { frames: this.getRxFrames(10) };
      }
      case 'configure_connection': {
        this._requireAllowedPort(params.port);
        return this._call('serial.open', {
          portName: params.port,
          baudRate: params.baudRate ?? 9600,
          dataBits: params.dataBits ?? 8,
          stopBits: params.stopBits ?? 1,
          parity: params.parity ?? 'none',
          flowControl: 'none'
        });
      }
      default: {
        const err = new Error(`未知工具: ${tool}`);
        err.mcpCode = -32602;
        throw err;
      }
    }
  }

  _toPayload(params) {
    if (Array.isArray(params.data)) {
      return { mode: 'hex', data: params.data.map((b) => Number(b).toString(16).padStart(2, '0')).join(' ') };
    }
    if (typeof params.hex === 'string') {
      return { mode: 'hex', data: params.hex };
    }
    if (typeof params.text === 'string') {
      return { mode: 'text', data: params.text };
    }
    const err = new Error('send_data 需提供 data/hex/text 之一');
    err.mcpCode = -32602;
    throw err;
  }

  async _call(method, params) {
    if (!this.allowedRpcMethods.has(method)) {
      const err = new Error(`方法 ${method} 不在 RPC 白名单`);
      err.mcpCode = -32001;
      throw err;
    }
    if (!this.backendRpc) {
      const err = new Error('Named Pipe 后端未连接');
      err.mcpCode = -32000;
      throw err;
    }
    return this.backendRpc.call(method, params);
  }
}

module.exports = { McpBridge };
