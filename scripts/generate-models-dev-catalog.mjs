import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  throw new Error('Usage: node scripts/generate-models-dev-catalog.mjs <models-dev.json> <output.json>');
}

const protocolByNpm = new Map([
  ['@ai-sdk/openai-compatible', 'openai-compatible'],
  ['@ai-sdk/xai', 'openai-compatible'],
  ['@openrouter/ai-sdk-provider', 'openai-compatible'],
  ['@ai-sdk/openai', 'openai-responses'],
  ['@ai-sdk/anthropic', 'anthropic'],
  ['@ai-sdk/google', 'google'],
]);

const baseUrlFallbacks = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  xai: 'https://api.x.ai/v1',
};

const excludedModelPatterns = [
  'embedding', 'rerank', 'whisper', 'tts', 'transcribe', 'speech', 'asr',
  'moderation', 'dall-e', 'image',
];

function modelEntries(models) {
  if (Array.isArray(models)) return models.map((model, index) => [String(index), model]);
  if (models && typeof models === 'object') return Object.entries(models);
  return [];
}

function classifyModel(id, model) {
  const input = Array.isArray(model?.modalities?.input) ? model.modalities.input.map(String) : [];
  const output = Array.isArray(model?.modalities?.output) ? model.modalities.output.map(String) : [];
  if (input.length > 0 && !input.includes('text')) return '输入模态不包含文本';
  if (output.length > 0 && !output.includes('text')) return '输出模态不包含文本';
  const lower = id.toLowerCase();
  const pattern = excludedModelPatterns.find((item) => lower.includes(item));
  return pattern ? `模型标识表明其属于 ${pattern} 能力` : null;
}

function normalizeProvider(id, raw) {
  const protocol = protocolByNpm.get(String(raw?.npm ?? ''));
  if (!protocol) return null;
  const baseUrl = String(raw?.api ?? '').trim().replace(/\/+$/, '') || baseUrlFallbacks[id];
  if (!baseUrl) throw new Error(`Standard provider ${id} has no base URL`);
  const models = modelEntries(raw?.models).map(([key, value]) => {
    const source = value && typeof value === 'object' ? value : { id: String(value ?? key) };
    const idValue = String(source.id ?? source.name ?? key).replace(/^models\//, '').trim();
    if (!idValue) throw new Error(`Provider ${id} contains a model without an id`);
    const reason = classifyModel(idValue, source);
    return {
      ...source,
      id: idValue,
      name: String(source.name ?? idValue),
      summaryEligible: reason === null,
      summaryIneligibleReason: reason,
    };
  });
  if (models.length === 0) throw new Error(`Standard provider ${id} has no models`);
  return {
    id,
    displayName: String(raw?.name ?? id),
    description: `${protocol} · ${String(raw?.npm ?? 'models.dev')}`,
    protocol,
    baseUrl,
    documentationUrl: String(raw?.doc ?? '').trim() || null,
    npmPackage: String(raw?.npm ?? ''),
    models,
  };
}

const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
const sourceBytes = await readFile(sourcePath);
const source = JSON.parse(sourceBytes.toString('utf8'));
const rawProviders = source?.providers && typeof source.providers === 'object' ? source.providers : source;
const providers = Object.entries(rawProviders)
  .map(([id, raw]) => normalizeProvider(id, raw))
  .filter(Boolean)
  .sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
const modelCount = providers.reduce((total, provider) => total + provider.models.length, 0);
if (providers.length !== 116 || modelCount !== 3926) {
  throw new Error(`Unexpected catalog boundary: ${providers.length} providers / ${modelCount} models`);
}
const catalog = {
  schemaVersion: 1,
  source: 'CipherTalk/electron/assets/models-dev.json',
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex').toUpperCase(),
  providerCount: providers.length,
  modelCount,
  providers,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`generated ${providers.length} providers / ${modelCount} models -> ${outputPath}`);