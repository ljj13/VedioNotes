/** models-dev-catalog.test 测试 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogPath = path.join(root, 'src-tauri', 'assets', 'models-dev-standard.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const frontendTypes = await readFile(path.join(root, 'src', 'lib', 'types.ts'), 'utf8');

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.providerCount, 116);
assert.equal(catalog.modelCount, 3926);
assert.match(catalog.sourceSha256, /^[A-F0-9]{64}$/);
assert.equal(catalog.providers.length, 116);
assert.equal(catalog.providers.reduce((total, provider) => total + provider.models.length, 0), 3926);
assert.deepEqual(
  new Set(catalog.providers.map((provider) => provider.protocol)),
  new Set(['openai-compatible', 'openai-responses', 'anthropic', 'google']),
);
for (const kind of ['open_ai_compatible', 'open_ai_responses', 'anthropic', 'google']) {
  assert.ok(frontendTypes.includes(`'${kind}'`), `frontend SummaryProviderKind is missing ${kind}`);
}
for (const provider of catalog.providers) {
  assert.ok(provider.id);
  assert.ok(provider.displayName);
  assert.ok(provider.baseUrl, `${provider.id} must have a normalized base URL`);
  assert.ok(provider.models.length > 0, `${provider.id} must retain its models`);
  for (const model of provider.models) {
    assert.ok(model.id, `${provider.id} contains a model without an id`);
    assert.equal(typeof model.summaryEligible, 'boolean');
    if (model.summaryEligible) assert.equal(model.summaryIneligibleReason, null);
    else assert.ok(model.summaryIneligibleReason);
  }
}
for (const id of ['openai', 'anthropic', 'google', 'deepseek', 'xiaomi']) {
  assert.ok(catalog.providers.some((provider) => provider.id === id), `${id} is missing`);
}
for (const id of ['amazon-bedrock', 'azure', 'google-vertex', 'gitlab']) {
  assert.equal(catalog.providers.some((provider) => provider.id === id), false, `${id} must be excluded`);
}

console.log(`models.dev standard catalog: pass (${catalog.providerCount} providers / ${catalog.modelCount} models)`);
