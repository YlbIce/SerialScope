function findRegisteredVirtualSimulatorPort(portsResult, portName = 'COM10') {
  const ports = Array.isArray(portsResult) ? portsResult : portsResult?.ports;
  const candidate = Array.isArray(ports)
    ? ports.find((port) => String(port.portName || '').toUpperCase() === portName.toUpperCase())
    : undefined;
  const identity = [candidate?.description, candidate?.manufacturer, candidate?.friendlyName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (!candidate || !identity.includes('ELTIMA') || !identity.includes('VIRTUAL') || !identity.includes('SERIAL')) {
    throw new Error(`${portName} 未被识别为已登记的 ELTIMA 虚拟串口，已拒绝自动模拟发送`);
  }
  return candidate;
}

module.exports = { findRegisteredVirtualSimulatorPort };
