// 把 docs/blog-serialscope-full.md 中的代码块/ASCII 框架图替换为图片引用。
// 复用 prep-code-images.js 的解析顺序，确保代码块与生成的图片一一对应。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docPath = path.join(root, 'docs', 'blog-serialscope-full.md');
const docPublishedPath = path.join(root, 'docs', 'blog-serialscope-for-wechat.md');
const htmlDir = path.join(root, 'build', 'code-html');

const markdown = fs.readFileSync(docPath, 'utf8');
const lines = markdown.split('\n');

// 解析代码块，与 prep-code-images.js 使用相同的命名规则。
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
    i += 1; // 闭合 ```
    blocks.push({ lang, content: content.join('\n'), startLine: lines.indexOf(m[0], i - content.length - 2) });
  } else {
    i += 1;
  }
}

// 重新编号（保持与 prep 一致：ascii 用 diagram，代码块用 code）
const usedNames = new Set();
blocks.forEach((block, idx) => {
  const isAscii = !block.lang;
  let base = isAscii ? `diagram-${String(idx + 1).padStart(2, '0')}` : `code-${String(idx + 1).padStart(2, '0')}`;
  let name = base;
  let counter = 2;
  while (usedNames.has(name)) { name = `${base}-${counter}`; counter += 1; }
  usedNames.add(name);
  block.outputName = name;
});

const usedSet = usedNames;
console.log('替换', blocks.length, '个代码块为图片');

// 重新逐行处理 markdown：遇到代码块起始 ```，整段替换为图片引用。
const out = [];
let inCode = false;
let blockIndex = 0;
for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
  const line = lines[lineIdx];
  const fence = line.match(/^```(\S*)\s*$/);
  if (fence && !inCode) {
    inCode = true;
    const block = blocks[blockIndex];
    const isAscii = !block.lang;
    const caption = isAscii ? '框架图' : `代码片段（${block.lang}）`;
    out.push(`![${caption} - ${block.outputName}](./artifacts/blog/${block.outputName}.png)`);
    blockIndex += 1;
    continue;
  }
  if (inCode && /^```\s*$/.test(line)) {
    inCode = false;
    continue;
  }
  if (inCode) continue; // 跳过代码块内容
  out.push(line);
}

fs.writeFileSync(docPublishedPath, out.join('\n'), 'utf8');
console.log('已生成公众号版文档:', docPublishedPath);
console.log('保留原文:', docPath);
