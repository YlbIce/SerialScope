const fs = require('fs');
const path = require('path');

const sensitive = /(?:api[_-]?key|authorization|password|secret|token)/i;

function safeValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => safeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 64).map(([key, item]) => [key, sensitive.test(key) ? '[redacted]' : safeValue(item, depth + 1)]));
  }
  if (typeof value === 'string') return value.slice(0, 4096);
  return value;
}

class RuntimeDiagnostics {
  constructor({ directory, runId, maxBytes = 5 * 1024 * 1024, maxFiles = 5, now = () => new Date() }) {
    this.directory = directory;
    this.runId = runId;
    this.maxBytes = maxBytes;
    this.maxFiles = maxFiles;
    this.now = now;
    this.index = 0;
    this.bytes = 0;
    fs.mkdirSync(directory, { recursive: true });
    this.rotate();
  }

  rotate() {
    this.filePath = path.join(this.directory, `serialscope-${this.runId}-${String(this.index++).padStart(3, '0')}.jsonl`);
    this.bytes = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;
    const prefix = `serialscope-${this.runId}-`;
    const files = fs.readdirSync(this.directory)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.jsonl'))
      .sort();
    while (files.length >= this.maxFiles) fs.rmSync(path.join(this.directory, files.shift()), { force: true });
  }

  log(source, event, details = {}) {
    try {
      const entry = JSON.stringify({ timestamp: this.now().toISOString(), runId: this.runId, source, event, details: safeValue(details) }) + '\n';
      const length = Buffer.byteLength(entry);
      if (this.bytes > 0 && this.bytes + length > this.maxBytes) this.rotate();
      fs.appendFileSync(this.filePath, entry, 'utf8');
      this.bytes += length;
    } catch {
      // 诊断日志不能影响串口数据面或崩溃路径。
    }
  }
}

module.exports = { RuntimeDiagnostics, safeValue };
