const names = {
  'crc8': 'CRC-8',
  'crc16-modbus': 'CRC16-Modbus（低字节在前）',
  'crc16-ccitt-false': 'CRC16-CCITT-FALSE（高字节在前）',
  'crc16-xmodem': 'CRC16-XMODEM（高字节在前）',
  'crc32': 'CRC32 / IEEE（低字节在前）'
};

export const checksumAlgorithms = Object.entries(names).map(([id, label]) => ({ id, label }));

export function parseHexBytes(value) {
  const normalized = String(value ?? '').replace(/[\s,]+/g, '');
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/i.test(normalized)) return null;
  return Uint8Array.from(normalized.match(/../g).map((pair) => Number.parseInt(pair, 16)));
}

function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) : (crc << 1);
  }
  return crc & 0xff;
}

function crc16(bytes, initial) {
  let crc = initial;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
  }
  return crc & 0xffff;
}

function crc16Modbus(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
  }
  return crc & 0xffff;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function checksumBytes(bytes, algorithm) {
  if (!(bytes instanceof Uint8Array) || !names[algorithm]) return null;
  if (algorithm === 'crc8') return [crc8(bytes)];
  if (algorithm === 'crc16-modbus') { const value = crc16Modbus(bytes); return [value & 0xff, value >>> 8]; }
  if (algorithm === 'crc16-ccitt-false') { const value = crc16(bytes, 0xffff); return [value >>> 8, value & 0xff]; }
  if (algorithm === 'crc16-xmodem') { const value = crc16(bytes, 0); return [value >>> 8, value & 0xff]; }
  const value = crc32(bytes);
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
}

export function appendChecksum(value, algorithm) {
  const bytes = parseHexBytes(value);
  const suffix = bytes && checksumBytes(bytes, algorithm);
  if (!suffix) return null;
  return [...bytes, ...suffix].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}
