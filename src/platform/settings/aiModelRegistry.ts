import { discoverSummaryModels } from '../../lib/bridge';

export type ProviderModelSource = 'catalog' | 'cache' | 'remote';
export type ProviderModelRefreshStatus = 'idle' | 'refreshing' | 'ready' | 'failed';

export interface ProviderModelSnapshot {
  providerId: string;
  modelIds: string[] | null;
  refreshedAt: number | null;
  source: ProviderModelSource;
  status: ProviderModelRefreshStatus;
  error: string | null;
}

type DiscoverModels = (profileId: string) => Promise<string[]>;
type RefreshOptions = { force?: boolean; discover?: DiscoverModels };

const CACHE_KEY = 'vedionotes.ai-model-cache.v1';
const snapshots = new Map<string, ProviderModelSnapshot>();
const inFlight = new Map<string, Promise<ProviderModelSnapshot>>();
const attemptedThisSession = new Set<string>();
const listeners = new Set<() => void>();
let cacheLoaded = false;

function emptySnapshot(providerId: string): ProviderModelSnapshot {
  return { providerId, modelIds: null, refreshedAt: null, source: 'catalog', status: 'idle', error: null };
}

function normalizeProviderId(providerId: string) {
  return providerId.trim().replace(/^catalog-/, '');
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { modelIds?: unknown; refreshedAt?: unknown }>;
    for (const [providerId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value?.modelIds) || !value.modelIds.every((item) => typeof item === 'string')) continue;
      snapshots.set(providerId, {
        providerId,
        modelIds: value.modelIds,
        refreshedAt: typeof value.refreshedAt === 'number' ? value.refreshedAt : null,
        source: 'cache',
        status: 'idle',
        error: null,
      });
    }
  } catch {
    // Corrupt cache is intentionally ignored; the embedded catalog remains usable.
  }
}

function persistCache() {
  try {
    const value: Record<string, { modelIds: string[]; refreshedAt: number | null }> = {};
    for (const [providerId, snapshot] of snapshots) {
      if (snapshot.modelIds) value[providerId] = { modelIds: snapshot.modelIds, refreshedAt: snapshot.refreshedAt };
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Model IDs are an optional startup cache. Storage failure must not break settings.
  }
}

function setSnapshot(providerId: string, next: ProviderModelSnapshot) {
  snapshots.set(providerId, next);
  emitChange();
  return next;
}

export function getProviderModelSnapshot(providerId: string): ProviderModelSnapshot {
  loadCache();
  const normalized = normalizeProviderId(providerId);
  let snapshot = snapshots.get(normalized);
  if (!snapshot) {
    snapshot = emptySnapshot(normalized);
    snapshots.set(normalized, snapshot);
  }
  return snapshot;
}

export function subscribeProviderModelRegistry(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshProviderModels(providerId: string, options: RefreshOptions = {}): Promise<ProviderModelSnapshot> {
  const normalized = normalizeProviderId(providerId);
  const existingRequest = inFlight.get(normalized);
  if (existingRequest) return existingRequest;
  if (!options.force && attemptedThisSession.has(normalized)) {
    return Promise.resolve(getProviderModelSnapshot(normalized));
  }

  attemptedThisSession.add(normalized);
  const previous = getProviderModelSnapshot(normalized);
  setSnapshot(normalized, { ...previous, status: 'refreshing', error: null });
  const discover = options.discover ?? discoverSummaryModels;
  const request = discover(`catalog-${normalized}`)
    .then((remoteIds) => {
      const modelIds = Array.from(new Set(remoteIds.map((id) => id.trim()).filter(Boolean)));
      const next = setSnapshot(normalized, {
        providerId: normalized,
        modelIds,
        refreshedAt: Date.now(),
        source: 'remote',
        status: 'ready',
        error: null,
      });
      persistCache();
      return next;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setSnapshot(normalized, { ...getProviderModelSnapshot(normalized), status: 'failed', error: message });
      throw error;
    })
    .finally(() => {
      inFlight.delete(normalized);
    });
  inFlight.set(normalized, request);
  return request;
}

export function ensureProviderModelsFresh(providerId: string, discover?: DiscoverModels) {
  return refreshProviderModels(providerId, { discover, force: false });
}

export function resetProviderModelRegistryForTests(options: { preserveStorage?: boolean } = {}) {
  snapshots.clear();
  inFlight.clear();
  attemptedThisSession.clear();
  listeners.clear();
  cacheLoaded = false;
  if (!options.preserveStorage) {
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
  }
}
