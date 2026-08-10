const assert = require('assert/strict');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = process.env.SERIALSCOPE_CROSS_SESSION_PIPE;
if (!pipeName || !pipeName.startsWith('\\\\.\\pipe\\')) {
  throw new Error('必须设置 SERIALSCOPE_CROSS_SESSION_PIPE，例如 \\..\\pipe\\SerialScope.Native.cross-session-<token>');
}

const client = new NamedPipeRpcClient({ connectTimeoutMs: 5000 });
(async () => {
  try {
    await assert.rejects(
      () => client.connect(pipeName),
      /后端在超时内未就绪|EACCES|EPERM|PIPE|断开|connect/i,
      '不同 Windows 会话的客户端必须无法取得 backend.ready'
    );
    console.log('跨 Windows 会话 Named Pipe 客户端：连接在 backend.ready 前被拒绝，验证通过');
  } finally {
    client.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
