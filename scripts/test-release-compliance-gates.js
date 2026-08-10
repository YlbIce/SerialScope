const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const gates = fs.readFileSync(path.join(root, 'docs', 'release-and-external-validation-gates.md'), 'utf8');
const cserialLicense = fs.readFileSync(path.join(root, 'backend', 'vendor', 'CSerialPort', 'LICENSE'), 'utf8');
const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
assert.match(gates, /9\.5 Windows 安装包、签名与更新/);
assert.match(gates, /9\.6 跨 Windows 会话拒绝/);
assert.match(gates, /9\.7 CSerialPort LGPL 审查/);
assert.match(gates, /9\.8 真实物理设备回归/);
assert.match(gates, /不得将 PFX、口令或云签名 Token 写入仓库、日志或 CI 输出/);
assert.match(gates, /没有真实双会话证据不得把 G3 标为完成/);
assert.match(cserialLicense, /LGPL3/);
assert.match(notices, /LGPL-3\.0-only WITH LGPL-3\.0-linking-exception/);
assert.match(notices, /完整许可证文本/);
console.log('发布与外部验证闸门：安装/签名、跨会话、LGPL 和真实设备授权清单验证通过');
