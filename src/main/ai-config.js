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
    this._load();
  }

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      if (parsed.provider === 'deepseek' || parsed.provider === 'mock') this.provider = parsed.provider;
      this.enabled = Boolean(parsed.enabled);
      this.allowDataUpload = Boolean(parsed.allowDataUpload);
    } catch {
      // 使用默认值
    }
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify({
        provider: this.provider,
        enabled: this.enabled,
        allowDataUpload: this.allowDataUpload
      }, null, 2), 'utf8');
    } catch (error) {
      console.error('AI 配置持久化失败:', error.message);
    }
  }

  getSnapshot() {
    return {
      provider: this.provider,
      enabled: this.enabled,
      allowDataUpload: this.allowDataUpload,
      hasApiKey: Boolean(this.runtimeApiKey || process.env.DEEPSEEK_API_KEY),
      keySource: this.runtimeApiKey ? 'runtime' : (process.env.DEEPSEEK_API_KEY ? 'env' : 'none')
    };
  }

  // 配置：provider/enabled/allowDataUpload 持久化；apiKey 仅内存态。
  configure({ provider, enabled, allowDataUpload, apiKey }) {
    if (provider === 'deepseek' || provider === 'mock') this.provider = provider;
    if (typeof enabled === 'boolean') this.enabled = enabled;
    if (typeof allowDataUpload === 'boolean') this.allowDataUpload = allowDataUpload;
    if (typeof apiKey === 'string' && apiKey.trim()) this.runtimeApiKey = apiKey.trim();
    this._persist();
    return this.getSnapshot();
  }

  // 当前可用 Key（运行时输入优先，否则环境变量）。
  getApiKey() {
    return this.runtimeApiKey || process.env.DEEPSEEK_API_KEY || '';
  }

  // 是否应使用真实 provider。
  useDeepSeek() {
    return this.provider === 'deepseek' && this.enabled && Boolean(this.getApiKey());
  }
}

module.exports = { AiConfig };
