const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const candidates = [
  path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
];
const electron = candidates.find((candidate) => fs.existsSync(candidate));
if (!electron) throw new Error('未找到 Electron 可执行文件。');

const child = spawn(electron, [path.join(__dirname, 'electron-ui-smoke.js')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});
child.on('exit', (code) => process.exit(code ?? 1));
