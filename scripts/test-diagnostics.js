const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RuntimeDiagnostics, safeValue } = require('../src/main/diagnostics');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-diagnostics-'));
try {
  let tick = 0;
  const diagnostics = new RuntimeDiagnostics({ directory, runId: 'test-run', maxBytes: 180, maxFiles: 2, now: () => new Date(`2026-08-09T00:00:0${tick++}Z`) });
  diagnostics.log('main', 'backend-start', { apiKey: 'secret', portName: 'COM10' });
  diagnostics.log('renderer', 'uncaught-error', { error: new Error('boom') });
  diagnostics.log('backend', 'serial-rx', { sequence: 3, bytes: 128, hex: 'not-recorded' });
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.jsonl'));
  assert.ok(files.length >= 1 && files.length <= 2, 'rotation must retain a bounded number of files');
  const entries = files.flatMap((file) => fs.readFileSync(path.join(directory, file), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  assert.ok(entries.every((entry) => entry.runId === 'test-run' && entry.timestamp && entry.source && entry.event));
  assert.ok(entries.every((entry) => entry.details.apiKey !== 'secret'));
  assert.equal(safeValue({ authorization: 'Bearer x' }).authorization, '[redacted]');
  console.log('持久化诊断：runId、脱敏和有界轮转验证通过');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
