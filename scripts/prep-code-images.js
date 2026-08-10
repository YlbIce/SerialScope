// 解析 blog-serialscope-full.md 的代码块，用 highlight.js 生成带语法高亮的独立 HTML 页面。
// 输出：临时目录 build/code-html/ 下的 code-NN.html，以及 build/code-manifest.json（块编号/语言/输出名）。
// 这些 HTML 由 Electron 无头渲染脚本逐一截图成 PNG。
const fs = require('fs');
const path = require('path');
const hljs = require('highlight.js');

const root = path.join(__dirname, '..');
const docPath = path.join(root, 'docs', 'blog-serialscope-full.md');
const htmlDir = path.join(root, 'build', 'code-html');
const manifestPath = path.join(root, 'build', 'code-manifest.json');

fs.mkdirSync(htmlDir, { recursive: true });

const markdown = fs.readFileSync(docPath, 'utf8');
const lines = markdown.split('\n');

// 解析代码块（仅匹配行首 ``` 围栏）
const blocks = [];
let i = 0;
while (i < lines.length) {
  const m = lines[i].match(/^```(\S*)\s*$/);
  if (m) {
    const lang = m[1] || '';
    const content = [];
    i += 1;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) {
      content.push(lines[i]);
      i += 1;
    }
    i += 1; // 跳过闭合 ```
    blocks.push({ lang, content: content.join('\n') });
  } else {
    i += 1;
  }
}

console.log('解析到代码块:', blocks.length);

const languages = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cpp: 'cpp', c: 'cpp',
  cmake: 'cmake', html: 'xml', powershell: 'powershell', sh: 'bash', bash: 'bash',
  json: 'json', text: 'plaintext', xml: 'xml'
};

function highlightBlock(block) {
  const lang = block.lang ? languages[block.lang.toLowerCase()] || block.lang.toLowerCase() : null;
  const code = block.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
  let body;
  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(block.content, { language: lang });
      body = `<pre><code class="hljs">${highlighted.value}</code></pre>`;
    } catch (_) {
      body = `<pre><code class="hljs">${code}</code></pre>`;
    }
  } else {
    // 无语言 / 纯文本：原样渲染（保留空格与换行），适合 ASCII 框架图。
    body = `<pre class="ascii"><code>${code}</code></pre>`;
  }
  return body;
}

const manifest = [];
const usedNames = new Set();

blocks.forEach((block, idx) => {
  const isAscii = !block.lang;
  let base = `code-${String(idx + 1).padStart(2, '0')}`;
  if (isAscii) base = `diagram-${String(idx + 1).padStart(2, '0')}`;
  let name = base;
  let counter = 2;
  while (usedNames.has(name)) { name = `${base}-${counter}`; counter += 1; }
  usedNames.add(name);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1e1e2e; padding:24px 28px; }
  .hljs { font-family:'Cascadia Code','JetBrains Mono','Microsoft YaHei','Microsoft YaHei UI',Consolas,'Courier New',monospace; font-size:16px; line-height:1.55; color:#d4d4d4; background:transparent; }
  pre { white-space:pre; overflow:visible; }
  pre.ascii { font-family:'Cascadia Code','Microsoft YaHei','Microsoft YaHei UI',Consolas,'Courier New',monospace; font-size:15px; line-height:1.4; color:#9cdcfe; background:#0d1117; padding:18px 22px; border-radius:8px; border:1px solid #30363d; white-space:pre; }
  .hljs-comment,.hljs-quote{color:#6a9955}
  .hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-section{color:#c586c0}
  .hljs-string,.hljs-regexp,.hljs-addition{color:#ce9178}
  .hljs-number,.hljs-symbol{color:#b5cea8}
  .hljs-title,.hljs-name,.hljs-function,.hljs-class .hljs-title{color:#dcdcaa}
  .hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-type{color:#9cdcfe}
  .hljs-built_in,.hljs-builtin-name{color:#4ec9b0}
  .hljs-meta{color:#9b9b9b}
  .hljs-tag{color:#569cd6}
</style>
</head>
<body>
${highlightBlock(block)}
</body>
</html>`;

  const htmlFile = path.join(htmlDir, `${name}.html`);
  fs.writeFileSync(htmlFile, html, 'utf8');
  manifest.push({ index: idx + 1, lang: block.lang, isAscii, htmlFile, outputName: name });
});

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('生成 HTML 页面:', manifest.length, '个');
console.log('manifest:', manifestPath);
