const { contextBridge, ipcRenderer } = require('electron');
let simulatorBootstrapConfig = null;
ipcRenderer.on('simulator:bootstrap', (_event, config) => { simulatorBootstrapConfig = config; });

contextBridge.exposeInMainWorld('serialScope', {
  getBackendInfo: () => ipcRenderer.invoke('backend:info'),
  startBackend: () => ipcRenderer.invoke('backend:start'),
  callBackend: (method, params) => ipcRenderer.invoke('backend:rpc', method, params),
  beginWorkbenchExecution: (request) => ipcRenderer.invoke('workbench:beginExecution', request),
  endWorkbenchExecution: () => ipcRenderer.invoke('workbench:endExecution'),
  launchSimulatorInstance: (config) => ipcRenderer.invoke('workbench:launchSimulator', config),
  validateSimulatorAutoPort: (portName) => ipcRenderer.invoke('simulator:validateAutoPort', portName),
  reportSimulatorReady: (result) => ipcRenderer.invoke('simulator:reportReady', result),
  reportSimulatorActivity: (activity) => ipcRenderer.send('simulator:activity', activity),
  getSimulatorBootstrap: () => simulatorBootstrapConfig,
  openModuleWindow: (moduleId) => ipcRenderer.invoke('window:openModule', moduleId),
  saveTextFile: (options) => ipcRenderer.invoke('file:saveText', options),
  openJsonFile: (options) => ipcRenderer.invoke('file:openJson', options),
  importProtocolFile: () => ipcRenderer.invoke('file:importProtocol'),
  getAiConfig: () => ipcRenderer.invoke('ai:config'),
  configureAi: (updates) => ipcRenderer.invoke('ai:config', updates),
  testAiConnection: (apiKey) => ipcRenderer.invoke('ai:test', { apiKey }),
  startMcpServer: () => ipcRenderer.invoke('mcp:start'),
  stopMcpServer: () => ipcRenderer.invoke('mcp:stop'),
  getMcpStatus: () => ipcRenderer.invoke('mcp:status'),
  setMcpPorts: (ports) => ipcRenderer.invoke('mcp:setPorts', ports),
  onBackendLog: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('backend:log', handler);
    return () => ipcRenderer.removeListener('backend:log', handler);
  },
  onBackendExit: (callback) => {
    const handler = (_event, code) => callback(code);
    ipcRenderer.on('backend:exit', handler);
    return () => ipcRenderer.removeListener('backend:exit', handler);
  },
  onBackendRpcNotification: (callback) => {
    const handler = (_event, notification) => callback(notification);
    ipcRenderer.on('backend:rpc-notification', handler);
    return () => ipcRenderer.removeListener('backend:rpc-notification', handler);
  },
  onSimulatorOwnership: (callback) => {
    const handler = (_event, ownership) => callback(ownership);
    ipcRenderer.on('simulator:ownership', handler);
    return () => ipcRenderer.removeListener('simulator:ownership', handler);
  },
  onSimulatorBootstrap: (callback) => {
    const handler = (_event, config) => callback(config);
    ipcRenderer.on('simulator:bootstrap', handler);
    return () => ipcRenderer.removeListener('simulator:bootstrap', handler);
  },
  onSimulatorInstanceStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('simulator:instance-status', handler);
    return () => ipcRenderer.removeListener('simulator:instance-status', handler);
  },
  onUiAction: (callback) => {
    const handler = (_event, detail) => callback(detail);
    ipcRenderer.on('ui:action', handler);
    return () => ipcRenderer.removeListener('ui:action', handler);
  }
});
