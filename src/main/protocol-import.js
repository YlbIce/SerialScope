// 规约文档文本提取：支持 docx (mammoth) / pdf (pdfjs-dist legacy) / txt / md。
// 在 Electron main 进程运行（renderer 无法直接 require Node 库）。
const fs = require('fs');
const path = require('path');

// pdfjs-dist legacy 在 Node 需要 DOM polyfill（文本提取不渲染，仅需最小集合）。
function installPdfPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        if (Array.isArray(init)) {
          this.a = init[0] ?? 1; this.b = init[1] ?? 0; this.c = init[2] ?? 0;
          this.d = init[3] ?? 1; this.e = init[4] ?? 0; this.f = init[5] ?? 0;
        } else if (init && typeof init === 'object') Object.assign(this, init);
        else { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
      }
      multiply(o) { return new globalThis.DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]); }
      translate(x, y) { return new globalThis.DOMMatrix([this.a, this.b, this.c, this.d, this.e + x, this.f + y]); }
      scale(x, y) { return new globalThis.DOMMatrix([this.a * (x ?? 1), this.b, this.c, this.d * (y ?? x ?? 1), this.e, this.f]); }
      transformPoint(p) { return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: p.z || 0, w: p.w || 1 }; }
    };
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D { moveTo() {} lineTo() {} closePath() {} rect() {} arc() {} };
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  }
}

async function extractPdfText(filePath) {
  installPdfPolyfills();
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFonts = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts');
  // pdfjs 要求 URL 形式（正斜杠结尾）。
  const standardFontUrl = standardFonts.replace(/\\/g, '/').replace(/\/?$/, '/');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    standardFontDataUrl: standardFontUrl
  }).promise;
  try {
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => item.str || '').join(' '));
    }
    return parts.join('\n\n');
  } finally {
    await doc.destroy();
  }
}

async function extractDocxText(filePath) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || '';
}

async function extractProtocolText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') return { ok: true, text: await extractDocxText(filePath) };
  if (ext === '.pdf') return { ok: true, text: await extractPdfText(filePath) };
  if (ext === '.txt' || ext === '.md') return { ok: true, text: fs.readFileSync(filePath, 'utf8') };
  return { ok: false, message: `不支持的文件类型：${ext || '(无扩展名)'}（支持 docx/pdf/txt/md）` };
}

module.exports = { extractProtocolText };
