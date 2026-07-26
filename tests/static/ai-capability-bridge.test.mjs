/** ai-capability-bridge.test 测试 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const types = readFileSync(new URL('../../src/lib/types.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../../src/lib/bridge.ts', import.meta.url), 'utf8');

for (const name of [
  'VectorConfig',
  'RerankConfig',
  'WebSearchConfig',
  'TtsConfig',
  'ImageConfig',
  'LocalAgentConfig',
  'CapabilitySettings',
  'CapabilityStatus',
  'SearchHit',
  'WebSearchResult',
  'LocalAgentResult',
]) {
  assert.match(types, new RegExp(`export (?:interface|type) ${name}\\b`), `missing ${name}`);
}

for (const command of [
  'get_capability_settings',
  'get_capability_status',
  'save_vector_config',
  'save_rerank_config',
  'save_web_search_config',
  'save_tts_config',
  'save_image_config',
  'save_local_agent_config',
  'test_vector_config',
  'test_rerank_config',
  'test_web_search_config',
  'test_tts_config',
  'test_image_config',
  'test_local_agent_config',
  'index_note',
  'semantic_search',
  'web_search',
  'synthesize_speech',
  'generate_note_image',
  'detect_local_agents',
  'run_local_agent',
]) {
  assert.match(bridge, new RegExp(`['\"]${command}['\"]`), `missing bridge command ${command}`);
}

console.log('AI capability bridge contract: pass');
