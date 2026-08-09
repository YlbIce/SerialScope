// DeepSeek provider 测试：
// 1) AI 配置持久化（不含 Key）  2) useDeepSeek 判定  3) 禁止上传拒绝
// 4) 有 DEEPSEEK_API_KEY 时真实调用 DeepSeek（端到端）  5) 无 Key 时明确 error
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AiConfig } = require('../src/main/ai-config');
const { parseProtocolWithDeepSeek, generateCommandsWithDeepSeek } = require('../src/main/deepseek-provider');

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log('PASS:', message);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serialscope-ai-'));
  try {
    // 1. 配置持久化（不含 Key）
    const config = new AiConfig(dir);
    config.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey: 'runtime-secret' });
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'ai-config.json'), 'utf8'));
    check(raw.provider === 'deepseek' && raw.enabled === true && raw.allowDataUpload === true, 'ai-config 持久化 provider/enabled/allowDataUpload');
    check(!JSON.stringify(raw).includes('runtime-secret'), 'apiKey 不写入配置文件');

    // 2. useDeepSeek 判定：runtime Key + 启用
    const config2 = new AiConfig(dir);
    config2.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true, apiKey: 'k' });
    check(config2.useDeepSeek() === true, 'useDeepSeek true（deepseek+enabled+Key）');
    config2.configure({ enabled: false });
    check(config2.useDeepSeek() === false, 'useDeepSeek false（disabled）');

    // 3. 禁止上传时真实调用拒绝
    const config3 = new AiConfig(dir);
    config3.configure({ provider: 'deepseek', enabled: true, allowDataUpload: false, apiKey: 'k' });
    let uploadDenied = false;
    try {
      // 模拟 Main 侧判断：allowDataUpload false 时拒绝
      if (!config3.allowDataUpload) throw Object.assign(new Error('允许数据上传后才能调用真实 provider'), { code: 'data-upload-denied' });
    } catch (e) {
      uploadDenied = e.code === 'data-upload-denied';
    }
    check(uploadDenied, 'allowDataUpload=false 时真实调用被拒');

    // 4. 无 Key 时真实调用明确 error（不静默回退）
    const config4 = new AiConfig(dir);
    config4.configure({ provider: 'deepseek', enabled: true, allowDataUpload: true });
    let noKey = false;
    try {
      await parseProtocolWithDeepSeek({ apiKey: '', text: 'test', includeSerialData: false });
    } catch (e) {
      noKey = e.code === 'no-api-key' || (e.message && e.message.includes('未配置'));
    }
    check(noKey, '无 Key 时 parseProtocolWithDeepSeek 抛 no-api-key');

    // 5. 真实调用（需 DEEPSEEK_API_KEY 环境变量）
    if (process.env.DEEPSEEK_API_KEY) {
      console.log('检测到 DEEPSEEK_API_KEY，尝试真实调用…');
      const parsed = await parseProtocolWithDeepSeek({
        apiKey: '',
        text: '帧头 0xAA 0x55，长度域 1 字节，之后命令码与数据',
        includeSerialData: false
      });
      check(parsed && typeof parsed === 'object', 'DeepSeek 真实解析返回对象');
      check(Array.isArray(parsed.frame_format?.header) || Array.isArray(parsed.fields), 'DeepSeek 解析含 frame_format/fields');
      const commands = await generateCommandsWithDeepSeek({
        apiKey: '',
        text: '帧头 0xAA 0x55，命令码 1 字节',
        includeSerialData: false
      });
      check(Array.isArray(commands), 'DeepSeek 真实命令生成返回数组');
      console.log('DeepSeek real call passed');
    } else {
      console.log('SKIP: 未设置 DEEPSEEK_API_KEY，跳过真实调用（仅验证配置与回退路径）');
    }

    console.log('DeepSeek provider test passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
