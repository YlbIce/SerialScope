const net = require('net');
const { NamedPipeRpcClient } = require('../src/main/named-pipe-rpc');

const pipeName = `\\\\.\\pipe\\SerialScope.Native.no-ready-${process.pid}-${Date.now()}`;
const server = net.createServer(() => {});

(async () => {
  const client = new NamedPipeRpcClient();
  try {
    await new Promise((resolve, reject) => server.listen(pipeName, resolve).once('error', reject));
    let timedOut = false;
    try {
      await client.connect(pipeName, 150);
    } catch (error) {
      timedOut = error.message.includes('未在连接后发送 backend.ready');
    }
    if (!timedOut) throw new Error('client accepted a pipe connection without backend.ready');
    console.log('Named Pipe backend.ready timeout passed');
  } finally {
    client.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
