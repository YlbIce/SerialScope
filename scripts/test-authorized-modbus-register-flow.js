const assert = require('assert/strict');
const { EventEmitter } = require('events');
const { frame, waitForRtuFrame } = require('./authorized-modbus-register-flow');

const client = new EventEmitter();
const request = frame([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]);
const validResponse = frame([0x01, 0x03, 0x02, 0x00, 0x64]);

(async () => {
  // 与真实 03 读取路径一致：内容谓词不含 CRC，让 CRC 错误只能被等待器本身拒绝。
  const waiting = waitForRtuFrame(client, request, (response) => response.length === 7 && response[0] === 0x01 && response[1] === 0x03 && response[2] === 2, 100);
  // 在本次 TX 前到达的有效旧帧必须被忽略。
  client.emit('notification', 'serial.rx', { sequence: 7, hex: validResponse.toString('hex') });
  client.emit('notification', 'serial.tx', { sequence: 8, hex: request.toString('hex') });
  // 发送后 CRC 无效帧同样不可触发流程。
  client.emit('notification', 'serial.rx', { sequence: 9, hex: '01 03 02 00 64 00 00' });
  client.emit('notification', 'serial.rx', { sequence: 10, hex: validResponse.toString('hex') });
  const response = await waiting;
  assert.deepEqual(response, validResponse);
  console.log('授权 Modbus 等待器：TX/RX 序号围栏与 CRC 拒绝验证通过');
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
