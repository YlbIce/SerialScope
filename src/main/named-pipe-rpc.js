const { EventEmitter } = require('events');
const net = require('net');

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

class NamedPipeRpcClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
  }

  async connect(pipeName, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    this.closed = false;
    while (!this.closed && Date.now() < deadline) {
      try {
        await this.#connectOnce(pipeName, Math.max(1, deadline - Date.now()));
        return;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ECONNREFUSED') throw error;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
    throw new Error('Named Pipe 后端在超时内未就绪');
  }

  call(method, params = {}) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error('Named Pipe 后端未连接'));
    const id = `rpc-${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.#write({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    this.closed = true;
    if (this.socket) this.socket.destroy();
    this.#rejectPending(new Error('Named Pipe 后端已断开'));
  }

  #connectOnce(pipeName, readyTimeoutMs) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(pipeName);
      let connected = false;
      let readyTimer = null;
      const onReady = () => {
        if (readyTimer) clearTimeout(readyTimer);
        resolve();
      };
      socket.once('connect', () => {
        connected = true;
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        socket.on('data', (chunk) => this.#read(chunk));
        socket.on('error', (error) => this.emit('error', error));
        socket.on('close', () => {
          if (this.socket === socket) this.socket = null;
          this.#rejectPending(new Error('Named Pipe 后端已断开'));
          if (!this.closed) this.emit('disconnect');
        });
        this.once('ready', onReady);
        readyTimer = setTimeout(() => {
          this.removeListener('ready', onReady);
          socket.destroy();
          reject(new Error('Named Pipe 后端未在连接后发送 backend.ready'));
        }, readyTimeoutMs);
      });
      socket.once('error', (error) => {
        if (!connected) reject(error);
      });
    });
  }

  #read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_MESSAGE_BYTES) {
        this.close();
        this.emit('error', new Error(`Named Pipe 消息长度无效：${length}`));
        return;
      }
      if (this.buffer.length < length + 4) return;
      const body = this.buffer.subarray(4, length + 4).toString('utf8');
      this.buffer = this.buffer.subarray(length + 4);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        this.emit('error', new Error('Named Pipe 返回了无效 JSON'));
        continue;
      }
      if (message.jsonrpc !== '2.0') {
        this.emit('error', new Error('Named Pipe 返回了非 JSON-RPC 2.0 消息'));
        continue;
      }
      if (typeof message.method === 'string') {
        this.emit('notification', message.method, message.params ?? {});
        if (message.method === 'backend.ready') this.emit('ready');
        continue;
      }
      const pending = this.pending.get(String(message.id));
      if (!pending) continue;
      this.pending.delete(String(message.id));
      if (message.error) pending.reject(new Error(message.error.message || 'JSON-RPC 调用失败'));
      else pending.resolve(message.result);
    }
  }

  #write(message) {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    if (body.length === 0 || body.length > MAX_MESSAGE_BYTES) throw new Error('JSON-RPC 请求超过 4 MiB 限制');
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(body.length, 0);
    this.socket.write(Buffer.concat([header, body]));
  }

  #rejectPending(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}

module.exports = { NamedPipeRpcClient, MAX_MESSAGE_BYTES };
