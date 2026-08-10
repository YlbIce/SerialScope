// Electron 无头渲染脚本：读取 build/code-manifest.json，把每个代码块 HTML 截图成 PNG。
// 输出到 docs/artifacts/blog/。复用单个窗口依次加载，每次加载前重置尺寸。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'build', 'code-manifest.json');
const outDir = path.join(root, 'docs', 'artifacts', 'blog');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // 支持分批：--from / --to（1 起），避免单进程连续加载过多文件触发 Electron 崩溃。
  const args = process.argv.slice(process.argv.indexOf(__filename) + 1);
  const fromIdx = (() => {
    const i = args.indexOf('--from'); return i >= 0 ? Math.max(0, Number(args[i + 1]) - 1) : 0;
  })();
  const toIdx = (() => {
    const i = args.indexOf('--to'); return i >= 0 ? Math.min(manifest.length, Number(args[i + 1])) : manifest.length;
  })();
  const slice = manifest.slice(fromIdx, toIdx);
  console.log(`本批渲染 ${slice.length} 个（${fromIdx + 1}~${toIdx}）`);

  const win = new BrowserWindow({
    width: 1280,
    height: 400,
    show: true,
    useContentSize: true,
    backgroundColor: '#1e1e2e',
    webPreferences: { offscreen: false }
  });

  for (let idx = 0; idx < slice.length; idx++) {
    const item = slice[idx];
    const globalIdx = fromIdx + idx;
    try {
      await win.loadFile(item.htmlFile);
      await delay(150);
      const bounds = await win.webContents.executeJavaScript(
        "(function(){ var el=document.querySelector('pre')||document.body; var r=el.getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) }; })()",
        true
      );
      win.setContentSize(Math.max(bounds.w + 40, 200), Math.max(bounds.h + 8, 60), false);
      await delay(200);
      const image = await win.webContents.capturePage();
      const outFile = path.join(outDir, `${item.outputName}.png`);
      fs.writeFileSync(outFile, image.toPNG());
      console.log(`[${globalIdx + 1}/${manifest.length}] 渲染: ${item.outputName}.png (${bounds.w}x${bounds.h})`);
    } catch (error) {
      console.error(`[${globalIdx + 1}/${manifest.length}] 渲染失败 ${item.outputName}: ${error.message}`);
    }
  }
  win.destroy();
  console.log(`本批完成，输出目录 -> ${outDir}`);
  app.exit(0);
});
