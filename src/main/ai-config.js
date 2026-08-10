// AI 配置管理：持久化 provider/enabled/allowDataUpload 到 userData/ai-config.json。
// API Key 不写入此文件，从环境变量 DEEPSEEK_API_KEY 或运行时内存输入读取。
const fs = require('fs');
const path = require('path');

class AiConfig {
  constructor(userDataPath) {
    this.configPath = path.join(userDataPath, 'ai-config.json');
    this.provider = 'mock';          // 'mock' | 'deepseek'
    this.enabled = false;
    this.allowDataUpload = false;
    this.runtimeApiKey = '';         // 运行时内存输入的 Key（不回写文件）
    this.saveApiKeyToDisk = false;   // 用户是否选择将 Key 持久化到本地
    this.savedApiKey = '';           // 持久化到本地的 Key（仅当 saveApiKeyToDisk 为 true）
    this._load();
  }

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      if (parsed.provider === 'deepseek' || parsed.provider === 'mock') this.provider = parsed.provider;
      this.enabled = Boolean(parsed.enabled);
      this.allowDataUpload = Boolean(parsed.allowDataUpload);
      this.saveApiKeyToDisk = Boolean(parsed.saveApiKeyToDisk);
      if (typeof parsed.savedApiKey === 'string') this.savedApiKey = parsed.savedApiKey;
    } catch {
      // 使用默认值
    }
  }

  _persist() {
    const payload = {
      provider: this.provider,
      enabled: this.enabled,
      allowDataUpload: this.allowDataUpload,
      saveApiKeyToDisk: this.saveApiKeyToDisk
    };
    // 仅当用户选择保存时才写入明文 Key，否则不落盘。
    if (this.saveApiKeyToDisk && this.savedApiKey) payload.savedApiKey = this.savedApiKey;
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.error('AI 配置持久化失败:', error.message);
    }
  }

  getSnapshot() {
    return {
      provider: this.provider,
      enabled: this.enabled,
      allowDataUpload: this.allowDataUpload,
      saveApiKeyToDisk: this.saveApiKeyToDisk,
      hasApiKey: Boolean(this.runtimeApiKey || this.savedApiKey || process.env.DEEPSEEK_API_KEY),
      hasPersistedApiKey: Boolean(this.savedApiKey),
      keySource: this.runtimeApiKey ? 'runtime' : (this.savedApiKey ? 'saved' : (process.env.DEEPSEEK_API_KEY ? 'env' : 'none'))
    };
  }

  // 配置：provider/enabled/allowDataUpload/saveApiKeyToDisk 持久化；apiKey 根据 saveApiKeyToDisk 决定是否落盘。
  configure({ provider, enabled, allowDataUpload, apiKey, saveApiKeyToDisk }) {
    if (provider === 'deepseek' || provider === 'mock') this.provider = provider;
    if (typeof enabled === 'boolean') this.enabled = enabled;
    if (typeof allowDataUpload === 'boolean') this.allowDataUpload = allowDataUpload;
    // 显式指定时更新保存选项；未指定则沿用原值。
    if (typeof saveApiKeyToDisk === 'boolean') this.saveApiKeyToDisk = saveApiKeyToDisk;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      this.runtimeApiKey = apiKey.trim();
      // 选择保存到本地则同时持久化，供下次启动读取。
      if (this.saveApiKeyToDisk) this.savedApiKey = apiKey.trim();
    } else if (this.saveApiKeyToDisk && !this.savedApiKey) {
      // 未提供新 Key 但选择保存：回退使用运行时 Key（若有）。
      if (this.runtimeApiKey) this.savedApiKey = this.runtimeApiKey;
    }
    // 用户显式关闭保存时，移除已持久化的明文 Key。
    if (this.saveApiKeyToDisk === false) this.savedApiKey = '';
    this._persist();
    return this.getSnapshot();
  }

  // 当前可用 Key（运行时输入优先，其次持久化 Key，否则环境变量）。
  getApiKey() {
    return this.runtimeApiKey || this.savedApiKey || process.env.DEEPSEEK_API_KEY || '';
  }

  // 是否应使用真实 provider。
  useDeepSeek() {
    return this.provider === 'deepseek' && this.enabled && Boolean(this.getApiKey());
  }
}

module.exports = { AiConfig };
