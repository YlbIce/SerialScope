// 验证变更 add-modbus-checksum-and-excel：
// 1) ensureCommandChecksum 为 Modbus 命令追加本地 CRC16-Modbus（标准向量验证）；
// 2) 非 Modbus 命令不追加；启发式兜底；
// 3) extractExcelText 解析用户提供的 Modbus 点表 xlsx。
const assert = require('assert');

const { ensureCommandChecksum, crc16Modbus } = require('../src/main/deepseek-provider.js');
const { extractProtocolText } = require('../src/main/protocol-import.js');

// ---- 1. CRC16-Modbus 标准向量 ----
// 标准向量：01 03 00 00 00 0A → CRC16 = 0xCDC5（公认值）
const crcVal = crc16Modbus([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]);
assert.strictEqual(crcVal, 0xCDC5, `CRC16-Modbus 应等于 0xCDC5，实际 ${crcVal.toString(16)}`);
// 01 06 00 01 00 64（写单寄存器）→ CRC16 = 0xE1D9
assert.strictEqual(crc16Modbus([0x01, 0x06, 0x00, 0x01, 0x00, 0x64]), 0xE1D9, '写单寄存器 CRC 应等于 0xE1D9');
console.log('[1] CRC16-Modbus 标准向量 (0xCDC5 / 0xE1D9): PASS');

// ---- 2. ensureCommandChecksum：显式 modbus-crc16 ----
// 01 03 00 00 00 01 → CRC16 = 0x0A84，追加低字节在前 = [0x84, 0x0A]
const withChecksum = ensureCommandChecksum([
  { name: '读保持寄存器', code: [0x01, 0x03, 0x00, 0x00, 0x00, 0x01], checksum: 'modbus-crc16' }
]);
assert.strictEqual(withChecksum[0].code.length, 8, '应追加 2 字节 CRC');
assert.strictEqual(withChecksum[0].code[6], 0x84, '低字节在前应为 0x84');
assert.strictEqual(withChecksum[0].code[7], 0x0A, '高字节应为 0x0A');
assert.strictEqual(withChecksum[0].checksum, 'modbus-crc16');
console.log('[2] 显式 modbus-crc16 命令追加 CRC 且低字节在前: PASS');

// ---- 3. 非 Modbus 命令不追加 ----
const noneCmd = ensureCommandChecksum([
  { name: '自定义', code: [0xAA, 0x55, 0x00, 0x01], checksum: 'none' }
]);
assert.strictEqual(noneCmd[0].code.length, 4, '非 Modbus 不应追加 CRC');
assert.deepStrictEqual(noneCmd[0].code, [0xAA, 0x55, 0x00, 0x01]);
console.log('[3] checksum=none 不追加: PASS');

// ---- 4. 无 checksum 标记，非 Modbus 帧（首字节不是合法功能码）----
const customNoMark = ensureCommandChecksum([
  { name: '心跳', code: [0xAA, 0x55, 0x00] }  // 第二个字节 0x55 不是标准 Modbus 功能码
]);
assert.strictEqual(customNoMark[0].code.length, 3, '非 Modbus 帧不应追加');
console.log('[4] 无标记非 Modbus 帧不追加: PASS');

// ---- 5. 启发式兜底：无 checksum 但前两字节=从站+功能码 ----
const heuristic = ensureCommandChecksum([
  { name: '读寄存器(未标checksum)', code: [0x01, 0x03, 0x00, 0x01, 0x00, 0x02] }
]);
assert.strictEqual(heuristic[0].code.length, 8, '启发式应追加 CRC');
assert.strictEqual(heuristic[0].checksum, 'modbus-crc16');
console.log('[5] 启发式兜底（从站+功能码）追加 CRC: PASS');

// ---- 6. 不修改入参原对象 ----
const orig = [{ name: 'x', code: [0x01, 0x03, 0x00, 0x00, 0x00, 0x01], checksum: 'modbus-crc16' }];
ensureCommandChecksum(orig);
assert.strictEqual(orig[0].code.length, 6, '入参对象不应被修改');
console.log('[6] 不修改入参原对象: PASS');

// ---- 7. Excel 点表解析（用户提供的实际 xlsx）----
async function runExcel() {
  const file = 'C:/Users/13686/AppData/Local/Temp/codebuddy-dropped-files/681ed6d5-bc78-4ea5-87ec-4a5804679a5a/ATC1100-JK5000modbus点表V1.0.82.xlsx';
  const result = await extractProtocolText(file);
  assert.strictEqual(result.ok, true, '应成功解析');
  assert(result.text.length > 100, `解析文本应非空，实际 ${result.text.length} 字符`);
  // 应包含各 sheet 名称
  assert(result.text.includes('Sheet: ATC监控器5000遥信点表(02功能码)'), '应包含遥信点表 sheet 名');
  assert(result.text.includes('Sheet: ATC监控器5000遥测点表(04功能码)'), '应包含遥测点表 sheet 名');
  // 应包含列头
  assert(result.text.includes('从站地址'), '应包含列头"从站地址"');
  assert(result.text.includes('modbus地址'), '应包含列头"modbus地址"');
  assert(result.text.includes('功能码'), '应包含列头"功能码"');
  console.log(`[7] Excel 点表解析成功（${result.text.length} 字符，含 4 个 sheet 表头）: PASS`);
}

(async () => {
  await runExcel();
  console.log('\n全部验证通过 ✓');
  process.exit(0);
})().catch((err) => {
  console.error('验证失败:', err.message);
  process.exit(1);
});
