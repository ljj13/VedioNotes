import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureProviderModelsFresh,
  getProviderModelSnapshot,
  refreshProviderModels,
  resetProviderModelRegistryForTests,
} from './aiModelRegistry';

describe('AI provider model registry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetProviderModelRegistryForTests();
  });

  it('deduplicates concurrent refreshes for one provider', async () => {
    let resolve!: (models: string[]) => void;
    const discover = vi.fn(() => new Promise<string[]>((done) => { resolve = done; }));
    const first = refreshProviderModels('xiaomi', { force: true, discover });
    const second = refreshProviderModels('xiaomi', { force: true, discover });
    expect(discover).toHaveBeenCalledTimes(1);
    resolve(['mimo-v2.5']);
    expect(await first).toEqual(await second);
  });

  it('auto refreshes a provider only once per application session', async () => {
    const discover = vi.fn().mockResolvedValue(['mimo-v2.5']);
    await ensureProviderModelsFresh('xiaomi', discover);
    await ensureProviderModelsFresh('xiaomi', discover);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('manual refresh forces a new request', async () => {
    const discover = vi.fn().mockResolvedValue(['mimo-v2.5']);
    await ensureProviderModelsFresh('xiaomi', discover);
    await refreshProviderModels('xiaomi', { force: true, discover });
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('keeps cached models visible while refreshing', async () => {
    const initial = vi.fn().mockResolvedValue(['cached-model']);
    await refreshProviderModels('xiaomi', { force: true, discover: initial });
    let resolve!: (models: string[]) => void;
    const pending = refreshProviderModels('xiaomi', { force: true, discover: () => new Promise((done) => { resolve = done; }) });
    expect(getProviderModelSnapshot('xiaomi')).toMatchObject({ modelIds: ['cached-model'], status: 'refreshing' });
    resolve(['fresh-model']);
    await pending;
  });

  it('persists a successful remote refresh', async () => {
    await refreshProviderModels('xiaomi', { force: true, discover: vi.fn().mockResolvedValue(['mimo-v2.5']) });
    expect(window.localStorage.getItem('vedionotes.ai-model-cache.v1')).toContain('mimo-v2.5');
  });

  it('restores persisted models as a cache snapshot', async () => {
    await refreshProviderModels('xiaomi', { force: true, discover: vi.fn().mockResolvedValue(['mimo-v2.5']) });
    resetProviderModelRegistryForTests({ preserveStorage: true });
    expect(getProviderModelSnapshot('xiaomi')).toMatchObject({ modelIds: ['mimo-v2.5'], source: 'cache', status: 'idle' });
  });

  it('preserves the last successful list when refresh fails', async () => {
    await refreshProviderModels('xiaomi', { force: true, discover: vi.fn().mockResolvedValue(['mimo-v2.5']) });
    await expect(refreshProviderModels('xiaomi', { force: true, discover: vi.fn().mockRejectedValue(new Error('offline')) })).rejects.toThrow('offline');
    expect(getProviderModelSnapshot('xiaomi')).toMatchObject({ modelIds: ['mimo-v2.5'], status: 'failed', source: 'remote' });
  });

  it('keeps provider refresh state isolated', async () => {
    await refreshProviderModels('xiaomi', { force: true, discover: vi.fn().mockResolvedValue(['mimo-v2.5']) });
    await refreshProviderModels('deepseek', { force: true, discover: vi.fn().mockResolvedValue(['deepseek-chat']) });
    expect(getProviderModelSnapshot('xiaomi').modelIds).toEqual(['mimo-v2.5']);
    expect(getProviderModelSnapshot('deepseek').modelIds).toEqual(['deepseek-chat']);
  });
});
