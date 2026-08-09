const assert = require('assert/strict');
const { createWorkbenchExecutionAuthorizer } = require('../src/main/workbench-execution');

(async () => {
  let clock = 1000;
  let serial = { isOpen: true, portName: 'COM3' };
  let confirmations = 0;
  const gate = createWorkbenchExecutionAuthorizer({
    getSerialState: async () => serial,
    confirmHardware: async () => { confirmations += 1; return false; },
    now: () => clock
  });
  await assert.rejects(() => gate.begin(1, 'simulation'), /COM10\/COM11/);
  serial = { isOpen: true, portName: 'COM11' };
  await gate.begin(1, 'simulation');
  await gate.validateSend(1);
  serial = { isOpen: true, portName: 'COM3' };
  await assert.rejects(() => gate.validateSend(1), /授权串口状态已变化/);
  serial = { isOpen: true, portName: 'COM3' };
  await assert.rejects(() => gate.begin(1, 'hardware'), /未获本机确认/);
  assert.equal(confirmations, 1);
  const realGate = createWorkbenchExecutionAuthorizer({ getSerialState: async () => serial, confirmHardware: async () => true, now: () => clock });
  await realGate.begin(2, 'hardware');
  await realGate.validateSend(2);
  serial = { isOpen: true, portName: 'COM4' };
  await assert.rejects(() => realGate.validateSend(2), /授权串口状态已变化/);
  serial = { isOpen: true, portName: 'COM3' };
  await realGate.begin(2, 'hardware');
  clock += 10 * 60 * 1000 + 1;
  await assert.rejects(() => realGate.validateSend(2), /未取得当前执行权限/);
  console.log('工作台 Main 进程执行授权：虚拟端口隔离、真实设备确认和过期收回验证通过');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
