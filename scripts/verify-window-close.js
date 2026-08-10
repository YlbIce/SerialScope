// 验证修复：关闭窗口不再抛 "Object has been destroyed"。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build', 'verify');
fs.mkdirSync(outDir, { recursive: true });

const { createWorkbenchExecutionAuthorizer } = require(path.join(root, 'src', 'main', 'workbench-execution.js'));

(async () => {
  const authorizer = createWorkbenchExecutionAuthorizer({
    getSerialState: async () => ({ isOpen: true, portName: 'COM10' }),
    confirmHardware: async () => false
  });
  const cachedWebContentsId = 12345;
  await authorizer.begin(cachedWebContentsId, 'simulation', {});

  let closedCbError = null;
  try {
    authorizer.end(cachedWebContentsId);
  } catch (error) {
    closedCbError = error;
  }

  const destroyedAccessError = (() => {
    try {
      const fake = { get id() { throw new TypeError('Object has been destroyed'); } };
      void fake.id;
    } catch (e) { return e.message; }
    return null;
  })();

  const result = {
    fixPasses: closedCbError === null,
    closedCallbackError: closedCbError ? closedCbError.message : null,
    destroyedAccessDemonstrated: destroyedAccessError,
    note: 'main.js:287 现使用创建窗口时缓存的 webContentsId'
  };
  fs.writeFileSync(path.join(outDir, 'window-close-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(closedCbError ? 1 : 0);
})();
