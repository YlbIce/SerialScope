// 规约文档导入集成测试：验证 txt/md/pdf 文本提取与不支持类型拒绝。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractProtocolText } = require('../src/main/protocol-import');

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 60>>stream\nBT /F1 24 Tf 100 700 Td (AA 55 LEN 03) Tj ET\nendstream\nendobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
  'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000218 00000 n \n0000000330 00000 n \n' +
  'trailer<</Size 6/Root 1 0 R>>\nstartxref\n382\n%%EOF\n', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log('PASS:', message);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-import-'));
  try {
    // txt
    const txt = path.join(dir, 'proto.txt');
    fs.writeFileSync(txt, '帧头 0xAA 0x55；长度域 1 字节。', 'utf8');
    let r = await extractProtocolText(txt);
    check(r.ok && r.text.includes('0xAA 0x55'), 'txt 导入');

    // md
    const md = path.join(dir, 'proto.md');
    fs.writeFileSync(md, '# 规约\n帧头 AA 55', 'utf8');
    r = await extractProtocolText(md);
    check(r.ok && r.text.includes('AA 55'), 'md 导入');

    // pdf
    const pdf = path.join(dir, 'proto.pdf');
    fs.writeFileSync(pdf, MINIMAL_PDF);
    r = await extractProtocolText(pdf);
    check(r.ok && r.text.includes('AA 55'), 'pdf 导入');

    // 不支持类型
    const exe = path.join(dir, 'proto.exe');
    fs.writeFileSync(exe, 'x');
    r = await extractProtocolText(exe);
    check(!r.ok && r.message && r.message.includes('不支持'), '不支持类型拒绝');

    console.log('Protocol import integration passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
