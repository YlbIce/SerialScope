function isApprovedVirtualPort(portName) {
  return /^(COM10|COM11)$/i.test(String(portName || ''));
}

function createWorkbenchExecutionAuthorizer({ getSerialState, confirmHardware, now = () => Date.now() }) {
  const grants = new Map();

  async function begin(senderId, requestedTarget, context) {
    const target = requestedTarget === 'hardware' ? 'hardware' : 'simulation';
    const state = await getSerialState();
    if (!state?.isOpen) throw new Error('请先打开串口，再执行流程');
    if (target === 'simulation' && !isApprovedVirtualPort(state.portName)) {
      throw new Error('模拟回归仅允许使用已登记的虚拟串口 COM10/COM11；当前端口已拒绝写入');
    }
    if (target === 'hardware' && !(await confirmHardware(state, context))) throw new Error('真实设备执行未获本机确认');
    const grant = { target, portName: state.portName, expiresAt: now() + 10 * 60 * 1000 };
    grants.set(senderId, grant);
    return { target, portName: state.portName };
  }

  async function validateSend(senderId) {
    const grant = grants.get(senderId);
    if (!grant || grant.expiresAt < now()) {
      grants.delete(senderId);
      throw new Error('工作台未取得当前执行权限，已拒绝发送');
    }
    const state = await getSerialState();
    if (!state?.isOpen || state.portName !== grant.portName) {
      grants.delete(senderId);
      throw new Error('授权串口状态已变化，已拒绝发送');
    }
    if (grant.target === 'simulation' && !isApprovedVirtualPort(state.portName)) {
      grants.delete(senderId);
      throw new Error('虚拟串口状态已变化，已拒绝发送');
    }
    return grant;
  }

  return { begin, validateSend, end: (senderId) => grants.delete(senderId), isApprovedVirtualPort };
}

module.exports = { createWorkbenchExecutionAuthorizer, isApprovedVirtualPort };
