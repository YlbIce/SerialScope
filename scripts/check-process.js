const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const changesRoot = path.join(root, 'changes');
const riskTiers = new Set(['L0', 'L1', 'L2', 'L3']);
const states = new Set(['draft', 'implementing', 'verify-complete', 'ready-for-review', 'review-passed', 'archived', 'blocked']);
const verificationStatuses = new Set(['passed', 'failed', 'blocked', 'not-run']);
const requiredFiles = ['proposal.md', 'design.md', 'specification.md', 'tasks.md', 'evidence.md', 'change.json'];

function fail(message) {
  errors.push(message);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`${path.relative(root, filePath)}: 无法读取（${error.message}）`);
    return '';
  }
}

function extractEvidenceJson(filePath) {
  const content = readText(filePath);
  const match = content.match(/```json\s*([\s\S]*?)```/i);
  if (!match) {
    fail(`${path.relative(root, filePath)}: 缺少 JSON 证据代码块`);
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail(`${path.relative(root, filePath)}: JSON 证据无法解析（${error.message}）`);
    return null;
  }
}

function validateVerification(changeId, verification, index) {
  const label = `changes/${changeId}/evidence.md verification[${index}]`;
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    fail(`${label}: 必须是对象`);
    return;
  }
  for (const field of ['command', 'kind', 'status', 'purpose', 'doesNotProve']) {
    if (typeof verification[field] !== 'string' || verification[field].trim() === '') {
      fail(`${label}: 缺少非空 ${field}`);
    }
  }
  if (!verificationStatuses.has(verification.status)) {
    fail(`${label}: status 必须是 ${[...verificationStatuses].join('|')}`);
  }
  if (['blocked', 'not-run'].includes(verification.status)
      && (typeof verification.reason !== 'string' || verification.reason.trim() === '')) {
    fail(`${label}: ${verification.status} 必须说明 reason`);
  }
}

const errors = [];
let checked = 0;

if (!fs.existsSync(changesRoot)) {
  fail('changes/: 目录不存在');
} else {
  for (const entry of fs.readdirSync(changesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_template') continue;
    const changeDir = path.join(changesRoot, entry.name);
    const manifestPath = path.join(changeDir, 'change.json');
    if (!fs.existsSync(manifestPath)) {
      fail(`changes/${entry.name}: 缺少 change.json`);
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(readText(manifestPath));
    } catch (error) {
      fail(`changes/${entry.name}/change.json: JSON 无法解析（${error.message}）`);
      continue;
    }
    checked += 1;

    if (manifest.schemaVersion !== 1) fail(`changes/${entry.name}/change.json: schemaVersion 必须为 1`);
    if (manifest.id !== entry.name) fail(`changes/${entry.name}/change.json: id 必须与目录名一致`);
    if (!riskTiers.has(manifest.riskTier)) fail(`changes/${entry.name}/change.json: riskTier 无效`);
    if (!states.has(manifest.state)) fail(`changes/${entry.name}/change.json: state 无效`);

    if (['L2', 'L3'].includes(manifest.riskTier)) {
      for (const fileName of requiredFiles) {
        if (!fs.existsSync(path.join(changeDir, fileName))) fail(`changes/${entry.name}: L2/L3 缺少 ${fileName}`);
      }
      const tasks = readText(path.join(changeDir, 'tasks.md'));
      if (!tasks.includes('场景—验证映射')) fail(`changes/${entry.name}/tasks.md: 缺少“场景—验证映射”章节`);
    }

    const evidence = extractEvidenceJson(path.join(changeDir, 'evidence.md'));
    if (!evidence) continue;
    if (evidence.change !== manifest.id) fail(`changes/${entry.name}/evidence.md: change 必须与 manifest id 一致`);
    if (evidence.riskTier !== manifest.riskTier) fail(`changes/${entry.name}/evidence.md: riskTier 必须与 manifest 一致`);
    if (!Array.isArray(evidence.verification) || evidence.verification.length === 0) {
      fail(`changes/${entry.name}/evidence.md: verification 必须是非空数组`);
    } else {
      evidence.verification.forEach((item, index) => validateVerification(manifest.id, item, index));
    }
  }
}

if (errors.length > 0) {
  console.error(`过程检查失败：${errors.length} 项`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`过程检查通过：已验证 ${checked} 个活动 change；模板目录已跳过。`);
