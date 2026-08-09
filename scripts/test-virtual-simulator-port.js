const assert = require('assert/strict');
const { findRegisteredVirtualSimulatorPort } = require('../src/main/virtual-simulator-port');

const registered = {
  ports: [{
    portName: 'COM10',
    description: 'ELTIMA Virtual Serial Port (COM10 -> COM11)',
    manufacturer: 'ELTIMA'
  }]
};

assert.equal(findRegisteredVirtualSimulatorPort(registered, 'COM10').portName, 'COM10');
assert.equal(findRegisteredVirtualSimulatorPort(registered.ports, 'com10').portName, 'COM10');
assert.throws(
  () => findRegisteredVirtualSimulatorPort({ ports: [{ portName: 'COM10', description: 'USB Serial Device' }] }),
  /未被识别/
);
assert.throws(() => findRegisteredVirtualSimulatorPort({ ports: [] }), /未被识别/);
console.log('虚拟下位机 Main 端口登记校验：对象返回值、身份拒绝和缺失端口验证通过');
