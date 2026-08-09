// 单一人工授权场景：COM10（ELTIMA 配对端）↔ COM11 Modbus Slave，115200 8N1，从站 1。
// 只在寄存器 0 严格等于 100 时写寄存器 1=101；拒绝任意端口/参数复用。
const { spawn } = require('child_process');
const path = require('path');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
  }
  return crc;
}

function frame(payload) {
  const crc = crc16(payload);
  return Buffer.from([...payload, crc & 0xff, (crc >>> 8) & 0xff]);
}

function equals(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedHex(value = '') {
  return String(value).replace(/[^0-9a-f]/gi, '').toUpperCase();
}

function callWithTimeout(client, method, params = {}, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error(`${method} RPC 超时（${timeoutMs} ms）`)), timeoutMs);
    client.call(method, params).then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function waitForRtuFrame(client, request, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    let txSequence = null;
    const received = [];
    const timer = setTimeout(() => finish(new Error(`等待 Modbus RTU 应答超时（${timeoutMs} ms）`)), timeoutMs);
    const expectedRequest = normalizedHex(request.toString('hex'));
    const processReceived = () => {
      if (!Number.isInteger(txSequence)) return;
      const eligible = received.filter((frame) => frame.sequence > txSequence);
      for (const frame of eligible) {
        buffered = Buffer.concat([buffered, frame.bytes]);
        for (let start = 0; start < buffered.length; start += 1) {
          for (let length = 5; start + length <= buffered.length; length += 1) {
            const candidate = buffered.subarray(start, start + length);
            const receivedCrc = candidate.readUInt16LE(candidate.length - 2);
            if (crc16(candidate.subarray(0, -2)) !== receivedCrc) continue;
            if (!predicate(candidate)) continue;
            return finish(null, Buffer.from(candidate));
          }
        }
      }
      received.length = 0;
      if (buffered.length > 256) buffered = buffered.subarray(-256);
    };
    const onNotification = (method, params) => {
      const sequence = Number(params?.sequence);
      if (!Number.isInteger(sequence)) return;
      if (method === 'serial.tx' && normalizedHex(params?.hex) === expectedRequest) {
        txSequence = sequence;
        processReceived();
        return;
      }
      if (method !== 'serial.rx' || typeof params?.hex !== 'string') return;
      const bytes = Buffer.from(params.hex.replace(/[^0-9a-f]/gi, ''), 'hex');
      if (bytes.length === 0) return;
      received.push({ sequence, bytes });
      processReceived();
    };
    function finish(error, value) {
      clearTimeout(timer);
      client.off('notification', onNotification);
      error ? reject(error) : resolve(value);
    }
    client.on('notification', onNotification);
  });
}

async function main() {
  const portName = 'COM10';
  const unit = 1;
  const baudRate = 115200;
  if (!process.argv.includes('--authorized-com10-to-com11-modbus-slave') || !process.argv.includes('--confirm-write-register-1-101')) {
    throw new Error('此脚本仅适用于已授权 COM10↔COM11 Modbus Slave 场景；须传入 --authorized-com10-to-com11-modbus-slave --confirm-write-register-1-101');
  }

  const pipeName = `\\\\.\\pipe\\SerialScope.Native.authorized-modbus-${process.pid}-${Date.now()}`;
  const backend = spawn(path.join(__dirname, '..', 'backend', 'bin', 'serialscope-backend.exe'), ['--pipe', pipeName], { stdio: 'ignore' });
  const client = new NamedPipeRpcClient();
  client.on('error', (error) => console.error(`Named Pipe 传输错误：${error.message}`));
  let executionError = null;
  let closeError = null;
  try {
    await client.connect(pipeName);
    const ports = await callWithTimeout(client, 'ports.list');
    if (!ports?.ports?.some((port) => String(port.portName).toUpperCase() === portName.toUpperCase())) throw new Error(`未发现授权端口 ${portName}`);
    const opened = await callWithTimeout(client, 'serial.open', { portName, baudRate, dataBits: 8, parity: 'none', stopBits: '1', flowControl: 'none', framing: { mode: 'raw' } });
    if (!opened?.ok) throw new Error(`打开 ${portName} 失败：${opened?.message || '未知错误'}`);

    const readRequest = frame([unit, 0x03, 0x00, 0x00, 0x00, 0x01]);
    const pendingRead = waitForRtuFrame(client, readRequest, (response) => response.length === 7 && response[0] === unit && response[1] === 0x03 && response[2] === 2);
    const readSent = await callWithTimeout(client, 'serial.send', { mode: 'hex', data: readRequest.toString('hex') });
    if (!readSent?.ok || readSent.bytes !== readRequest.length) throw new Error('03 查询报文未完整发送');
    const readResponse = await pendingRead;
    const register0 = readResponse.readUInt16BE(3);
    console.log(`03 查询成功：寄存器 0 = ${register0}`);
    if (register0 !== 100) throw new Error(`寄存器 0 为 ${register0}，不等于授权条件 100；已拒绝向寄存器 1 写入`);

    const writeRequest = frame([unit, 0x06, 0x00, 0x01, 0x00, 0x65]);
    const pendingWrite = waitForRtuFrame(client, writeRequest, (response) => equals([...response], [...writeRequest]));
    const writeSent = await callWithTimeout(client, 'serial.send', { mode: 'hex', data: writeRequest.toString('hex') });
    if (!writeSent?.ok || writeSent.bytes !== writeRequest.length) throw new Error('06 写入报文未完整发送');
    await pendingWrite;
    console.log('06 写入已确认：寄存器 1 = 101');
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    try {
      const closed = await callWithTimeout(client, 'serial.close').catch((error) => ({ ok: false, message: error.message }));
      const closeVerified = closed?.ok === true && closed?.state?.isOpen === false;
      if (!closeVerified) {
        const message = `串口关闭未得到确认：${closed?.message || '未知错误'}`;
        if (executionError) console.error(message);
        else closeError = new Error(message);
      }
    } finally {
      client.close();
      backend.kill();
    }
    if (closeError) throw closeError;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { callWithTimeout, crc16, frame, waitForRtuFrame };
