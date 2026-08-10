import assert from 'node:assert/strict';
import { appendChecksum, checksumBytes, parseHexBytes } from '../src/renderer-react/src/checksums.mjs';

const vector = parseHexBytes('31 32 33 34 35 36 37 38 39');
assert.deepEqual(checksumBytes(vector, 'crc8'), [0xF4]);
assert.deepEqual(checksumBytes(vector, 'crc16-modbus'), [0x37, 0x4B]);
assert.deepEqual(checksumBytes(vector, 'crc16-ccitt-false'), [0x29, 0xB1]);
assert.deepEqual(checksumBytes(vector, 'crc16-xmodem'), [0x31, 0xC3]);
assert.deepEqual(checksumBytes(vector, 'crc32'), [0x26, 0x39, 0xF4, 0xCB]);
assert.equal(appendChecksum('01 03 00 00 00 01', 'crc16-modbus'), '01 03 00 00 00 01 84 0A');
assert.equal(appendChecksum('0', 'crc8'), null);
assert.equal(appendChecksum('GG', 'crc8'), null);
assert.equal(appendChecksum('', 'crc8'), null);
console.log('工作台校验计算：标准 CRC 向量、字节序和非法 HEX 边界验证通过');
