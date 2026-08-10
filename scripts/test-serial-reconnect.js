const assert = require('assert/strict');
const policy = require('../src/renderer/serial-reconnect-policy');

assert.equal(policy.delayForAttempt(0), 600);
assert.equal(policy.delayForAttempt(1), 1200);
assert.equal(policy.delayForAttempt(4), 8000);
assert.equal(policy.delayForAttempt(20), 8000);
assert.equal(policy.canRetry(false, 0, false), false);
assert.equal(policy.canRetry(true, 0, false), true);
assert.equal(policy.canRetry(true, policy.maxAttempts - 1, false), true);
assert.equal(policy.canRetry(true, policy.maxAttempts, false), false);
assert.equal(policy.canRetry(true, 0, true), false);
console.log('串口自动重连：指数退避上限、最大次数和手动关闭取消验证通过');
