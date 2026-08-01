import type { SummaryModelCatalogEntry, SummaryProviderCatalogEntry } from './types';

export type AiModelCategory = 'summary' | 'vector' | 'rerank' | 'websearch' | 'tts' | 'image' | 'agent';

const UNAVAILABLE_STATUS_MARKERS = ['deprecated', 'retired', 'disabled', 'legacy', 'sunset', 'removed', 'archived', 'unavailable'];
const ASR_MARKERS = ['asr', 'speech-to-text', 'speech_to_text', 'transcription', 'transcribe'];
const TTS_MARKERS = ['tts', 'text-to-speech', 'text_to_speech', 'speech-synthesis'];
const VECTOR_MARKERS = ['embedding', 'embeddings', 'vector'];
const RERANK_MARKERS = ['rerank', 'reranker', 're-rank'];
const IMAGE_MARKERS = ['image-generation', 'image_generation', 'text-to-image', 'image-edit', 'image_edit'];
const SUMMARY_EXCLUSION_MARKERS = [
  ...ASR_MARKERS,
  ...TTS_MARKERS,
  ...VECTOR_MARKERS,
  ...RERANK_MARKERS,
  ...IMAGE_MARKERS,
  'ocr',
  'moderation',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value.toLowerCase()];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [key.toLowerCase(), ...strings(item)]);
  }
  return [];
}

function explicitSignals(model: SummaryModelCatalogEntry): string[] {
  const runtime = model as SummaryModelCatalogEntry & Record<string, unknown>;
  return [
    ...strings(model.family),
    ...strings(runtime.type),
    ...strings(runtime.task),
    ...strings(runtime.category),
    ...strings(runtime.endpoints),
    ...strings(model.capabilities),
  ];
}

function identifierSignals(model: SummaryModelCatalogEntry): string[] {
  return [model.id.toLowerCase(), model.name.toLowerCase()];
}

function modalities(model: SummaryModelCatalogEntry, direction: 'input' | 'output'): string[] {
  const value = asRecord(model.modalities)[direction];
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
}

function containsMarker(values: string[], markers: string[]) {
  return values.some((value) => markers.some((marker) => value === marker || value.includes(marker)));
}

export function isUnavailableModelStatus(status?: string) {
  const normalized = status?.trim().toLowerCase() ?? '';
  return UNAVAILABLE_STATUS_MARKERS.some((marker) => normalized.includes(marker));
}

export function isEligibleForCategory(model: SummaryModelCatalogEntry, category: AiModelCategory): boolean {
  if (isUnavailableModelStatus(model.status)) return false;

  const explicit = explicitSignals(model);
  const identifiers = identifierSignals(model);
  const input = modalities(model, 'input');
  const output = modalities(model, 'output');
  const voice = containsMarker(explicit, [...ASR_MARKERS, ...TTS_MARKERS])
    || containsMarker(identifiers, [...ASR_MARKERS, ...TTS_MARKERS])
    || output.includes('audio')
    || (input.includes('audio') && model.summaryEligible !== true);
  const vector = containsMarker(explicit, VECTOR_MARKERS)
    || containsMarker(identifiers, VECTOR_MARKERS)
    || output.includes('embedding');
  const rerank = containsMarker(explicit, RERANK_MARKERS)
    || containsMarker(identifiers, RERANK_MARKERS)
    || output.includes('score');
  const image = containsMarker(explicit, IMAGE_MARKERS)
    || containsMarker(identifiers, IMAGE_MARKERS)
    || output.includes('image');

  switch (category) {
    case 'summary': {
      if (model.summaryEligible !== true) return false;
      if (containsMarker(explicit, SUMMARY_EXCLUSION_MARKERS)) return false;
      if (voice || vector || rerank || image) return false;
      return output.length === 0 || output.includes('text');
    }
    case 'vector': return vector;
    case 'rerank': return rerank;
    case 'tts': return voice;
    case 'image': return image;
    case 'websearch': return Boolean(asRecord(model.capabilities).webSearch ?? asRecord(model.capabilities).web_search);
    case 'agent': return Boolean(asRecord(model.capabilities).localAgent ?? asRecord(model.capabilities).local_agent);
    default: return false;
  }
}

export function filterModelsForCategory(models: SummaryModelCatalogEntry[], category: AiModelCategory) {
  return models.filter((model) => isEligibleForCategory(model, category));
}

function unknownRemoteModel(id: string): SummaryModelCatalogEntry {
  return {
    id,
    name: id,
    summaryEligible: false,
    summaryIneligibleReason: '模型类型待确认',
    modalities: {},
    capabilities: {},
    limit: {},
    cost: {},
    status: 'active',
  };
}

/**
 * Remote IDs are the availability authority. The embedded catalog only enriches
 * those IDs; catalog-only entries are never appended after a successful refresh.
 */
export function mergeRemoteProviderModels(
  provider: SummaryProviderCatalogEntry,
  remoteModelIds: string[],
): SummaryModelCatalogEntry[] {
  const catalogById = new Map(provider.models.map((model) => [model.id.toLowerCase(), model]));
  const seen = new Set<string>();
  const merged: SummaryModelCatalogEntry[] = [];
  for (const rawId of remoteModelIds) {
    const id = rawId.trim();
    const normalized = id.toLowerCase();
    if (!id || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(catalogById.get(normalized) ?? unknownRemoteModel(id));
  }
  return merged;
}
