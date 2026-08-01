import { describe, expect, it } from 'vitest';
import type { SummaryModelCatalogEntry, SummaryProviderCatalogEntry } from './types';
import {
  filterModelsForCategory,
  isEligibleForCategory,
  mergeRemoteProviderModels,
} from './aiModelCatalog';

function model(overrides: Partial<SummaryModelCatalogEntry> & Pick<SummaryModelCatalogEntry, 'id'>): SummaryModelCatalogEntry {
  const { id, ...rest } = overrides;
  return {
    id,
    name: overrides.name ?? id,
    summaryEligible: overrides.summaryEligible ?? false,
    modalities: overrides.modalities ?? {},
    capabilities: overrides.capabilities ?? {},
    limit: overrides.limit ?? {},
    cost: overrides.cost ?? {},
    ...rest,
  };
}

const provider: SummaryProviderCatalogEntry = {
  id: 'xiaomi-token-plan-cn',
  displayName: 'Xiaomi Token Plan (China)',
  description: 'test',
  protocol: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  npmPackage: '@ai-sdk/openai-compatible',
  models: [
    model({ id: 'mimo-v2.5', name: 'MiMo-V2.5', summaryEligible: true, modalities: { input: ['text'], output: ['text'] }, capabilities: { reasoning: true } }),
    model({ id: 'mimo-embed', summaryEligible: false, family: 'embedding', modalities: { input: ['text'], output: ['embedding'] } }),
    model({ id: 'mimo-rerank', summaryEligible: false, family: 'rerank', modalities: { input: ['text'], output: ['score'] } }),
    model({ id: 'mimo-tts', summaryEligible: false, family: 'tts', modalities: { input: ['text'], output: ['audio'] } }),
    model({ id: 'mimo-image', summaryEligible: false, family: 'image-generation', modalities: { input: ['text'], output: ['image'] } }),
    model({ id: 'old-mimo', summaryEligible: true, status: 'retired', modalities: { input: ['text'], output: ['text'] } }),
  ],
};

describe('AI model catalog pipeline', () => {
  it('keeps active text-generation models in the summary category', () => {
    expect(isEligibleForCategory(provider.models[0], 'summary')).toBe(true);
  });

  it('keeps reasoning models in the summary category', () => {
    expect(isEligibleForCategory(model({ id: 'reasoner', summaryEligible: true, capabilities: { reasoning: true }, modalities: { input: ['text'], output: ['text'] } }), 'summary')).toBe(true);
  });

  it('excludes ASR models from the summary category', () => {
    expect(isEligibleForCategory(model({ id: 'mimo-v2.5-asr', summaryEligible: false, family: 'asr', modalities: { input: ['audio'], output: ['text'] } }), 'summary')).toBe(false);
  });

  it('places ASR models in the voice category', () => {
    expect(isEligibleForCategory(model({ id: 'mimo-v2.5-asr', family: 'asr' }), 'tts')).toBe(true);
  });

  it('places an unknown remote ASR id in voice but not summary', () => {
    const [unknownAsr] = mergeRemoteProviderModels(provider, ['mimo-v2.5-asr']);
    expect(isEligibleForCategory(unknownAsr, 'tts')).toBe(true);
    expect(isEligibleForCategory(unknownAsr, 'summary')).toBe(false);
  });

  it('excludes TTS from summary', () => {
    expect(isEligibleForCategory(provider.models[3], 'summary')).toBe(false);
  });

  it('places TTS in voice', () => {
    expect(isEligibleForCategory(provider.models[3], 'tts')).toBe(true);
  });

  it('places embedding models only in vector', () => {
    expect(isEligibleForCategory(provider.models[1], 'vector')).toBe(true);
    expect(isEligibleForCategory(provider.models[1], 'summary')).toBe(false);
  });

  it('places rerank models only in rerank', () => {
    expect(isEligibleForCategory(provider.models[2], 'rerank')).toBe(true);
    expect(isEligibleForCategory(provider.models[2], 'summary')).toBe(false);
  });

  it('places image generation models only in image', () => {
    expect(isEligibleForCategory(provider.models[4], 'image')).toBe(true);
    expect(isEligibleForCategory(provider.models[4], 'summary')).toBe(false);
  });

  it('excludes moderation models from summary', () => {
    expect(isEligibleForCategory(model({ id: 'safe', summaryEligible: true, family: 'moderation' }), 'summary')).toBe(false);
  });

  it('excludes OCR-only models from summary', () => {
    expect(isEligibleForCategory(model({ id: 'ocr', summaryEligible: true, family: 'ocr' }), 'summary')).toBe(false);
  });

  it('excludes deprecated, retired and disabled models from every category', () => {
    for (const status of ['deprecated', 'retired', 'disabled']) {
      expect(isEligibleForCategory(model({ id: status, summaryEligible: true, status }), 'summary')).toBe(false);
    }
  });

  it('treats the remote list as authoritative after refresh', () => {
    expect(mergeRemoteProviderModels(provider, ['mimo-v2.5']).map((item) => item.id)).toEqual(['mimo-v2.5']);
  });

  it('does not add catalog-only retired models back to a remote list', () => {
    expect(mergeRemoteProviderModels(provider, ['mimo-v2.5']).some((item) => item.id === 'old-mimo')).toBe(false);
  });

  it('enriches remote ids with catalog metadata', () => {
    const [merged] = mergeRemoteProviderModels(provider, ['mimo-v2.5']);
    expect(merged.name).toBe('MiMo-V2.5');
    expect(merged.capabilities).toEqual({ reasoning: true });
  });

  it('deduplicates and trims remote model ids', () => {
    expect(mergeRemoteProviderModels(provider, [' mimo-v2.5 ', 'mimo-v2.5', '']).map((item) => item.id)).toEqual(['mimo-v2.5']);
  });

  it('does not assume an unknown remote model is summary eligible', () => {
    const [unknown] = mergeRemoteProviderModels(provider, ['brand-new-model']);
    expect(unknown.summaryEligible).toBe(false);
    expect(isEligibleForCategory(unknown, 'summary')).toBe(false);
  });

  it('filters search candidates at the category data layer', () => {
    const remote = mergeRemoteProviderModels(provider, ['mimo-v2.5', 'mimo-embed', 'mimo-rerank', 'mimo-tts']);
    expect(filterModelsForCategory(remote, 'summary').map((item) => item.id)).toEqual(['mimo-v2.5']);
  });

  it('keeps voice candidates separate from summary candidates', () => {
    const remote = mergeRemoteProviderModels(provider, ['mimo-v2.5', 'mimo-v2.5-asr', 'mimo-tts']);
    expect(filterModelsForCategory(remote, 'tts').map((item) => item.id)).toEqual(['mimo-v2.5-asr', 'mimo-tts']);
  });
});
