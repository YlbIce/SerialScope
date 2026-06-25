const http = require('http');
const crypto = require('crypto');

const port = Number(process.env.SERIALSCOPE_WS_PORT || 47990);
const clients = new Set();

const ports = [
  {
    portName: 'COM3',
    systemLocation: '\\\\.\\COM3',
    description: 'USB-SERIAL CH340',
    manufacturer: 'WCH',
    serialNumber: 'A10001',
    vendorId: '0x1A86',
    productId: '0x7523'
  },
  {
    portName: 'COM7',
    systemLocation: '\\\\.\\COM7',
    description: 'USB Serial Device',
    manufacturer: 'Demo Instruments',
    serialNumber: 'SIM-007',
    vendorId: '0x1209',
    productId: '0x0001'
  }
];

const state = {
  isOpen: false,
  portName: '',
  baudRate: 115200,
  rxBytes: 0,
  txBytes: 0,
  rxFrames: 0,
  txFrames: 0,
  startedAt: Date.now()
};

function frame(socket, payload) {
  const data = Buffer.from(payload);
  if (data.length < 126) {
    return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(data.length, 2);
  return Buffer.concat([header, data]);
}

function send(socket, object) {
  if (!clients.has(socket)) return;
  socket.write(frame(socket, JSON.stringify(object)));
}

function broadcast(object) {
  for (const socket of clients) {
    send(socket, object);
  }
}

function decodeFrame(buffer) {
  const length = buffer[1] & 0x7f;
  const maskOffset = length === 126 ? 4 : 2;
  const payloadLength = length === 126 ? buffer.readUInt16BE(2) : length;
  const mask = buffer.subarray(maskOffset, maskOffset + 4);
  const payload = buffer.subarray(maskOffset + 4, maskOffset + 4 + payloadLength);
  const decoded = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    decoded[i] = payload[i] ^ mask[i % 4];
  }
  return decoded.toString('utf8');
}

function bytesToHex(buffer) {
  return Array.from(buffer).map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function textToHex(text) {
  return bytesToHex(Buffer.from(text, 'utf8'));
}

function sendState(socket) {
  send(socket, { type: 'serial:state', payload: { ...state, uptimeMs: Date.now() - state.startedAt } });
}

function handleCommand(socket, command) {
  const payload = command.payload || {};
  if (command.type === 'ports:list') {
    send(socket, { type: 'ports:list', requestId: command.requestId, payload: { ports } });
    return;
  }
  if (command.type === 'serial:open') {
    state.isOpen = true;
    state.portName = payload.portName || ports[0].portName;
    state.baudRate = payload.baudRate || 115200;
    state.startedAt = Date.now();
    send(socket, { type: 'serial:open:result', requestId: command.requestId, payload: { ok: true, message: 'Mock 串口已打开', state } });
    broadcast({ type: 'serial:state', payload: state });
    return;
  }
  if (command.type === 'serial:close') {
    state.isOpen = false;
    send(socket, { type: 'serial:close:result', requestId: command.requestId, payload: { ok: true, message: 'Mock 串口已关闭', state } });
    broadcast({ type: 'serial:state', payload: state });
    return;
  }
  if (command.type === 'serial:send') {
    const text = payload.mode === 'hex' ? `[HEX] ${payload.data}` : payload.data;
    const bytes = Buffer.from(text, 'utf8');
    state.txBytes += bytes.length;
    state.txFrames += 1;
    send(socket, { type: 'serial:send:result', requestId: command.requestId, payload: { ok: true, bytes: bytes.length, state } });
    broadcast({ type: 'serial:tx', payload: { timestamp: new Date().toISOString(), direction: 'tx', bytes: bytes.length, text, hex: textToHex(text) } });
    setTimeout(() => emitRx(`OK ${text}`), 140);
    return;
  }
}

function emitRx(text) {
  if (!state.isOpen) return;
  const noisy = Math.random() > 0.82 ? `WARN temp=${Math.round(40 + Math.random() * 20)}C` : text;
  const bytes = Buffer.from(noisy, 'utf8');
  state.rxBytes += bytes.length;
  state.rxFrames += 1;
  broadcast({ type: 'serial:rx', payload: { timestamp: new Date().toISOString(), direction: 'rx', bytes: bytes.length, text: noisy, hex: bytesToHex(bytes) } });
  broadcast({ type: 'serial:state', payload: state });
}

const server = http.createServer();
server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    ''
  ].join('\r\n'));

  clients.add(socket);
  send(socket, { type: 'backend:hello', payload: { name: 'SerialScope Mock Backend', version: '0.1.0', wsPort: port } });
  send(socket, { type: 'ports:list', payload: { ports } });
  sendState(socket);

  socket.on('data', (buffer) => {
    try {
      handleCommand(socket, JSON.parse(decodeFrame(buffer)));
    } catch (error) {
      send(socket, { type: 'error', payload: { message: error.message } });
    }
  });
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
});

setInterval(() => {
  if (state.isOpen) {
    emitRx(`RX seq=${state.rxFrames} value=${Math.round(Math.random() * 1000)}`);
  }
}, 1600);

server.listen(port, '127.0.0.1', () => {
  console.log(`SerialScope mock backend listening on ws://127.0.0.1:${port}`);
});
