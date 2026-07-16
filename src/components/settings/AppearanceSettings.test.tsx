import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPreferences, AppearancePreferences } from '../../lib/types';
import AppearanceSettings from './AppearanceSettings';

const bridgeMocks = vi.hoisted(() => ({
  saveAppearancePreferences: vi.fn(),
}));

vi.mock('../../lib/bridge', () => ({
  saveAppearancePreferences: bridgeMocks.saveAppearancePreferences,
}));

const basePreferences: AppPreferences = {
  schemaVersion: 1,
  markdownOutputDir: null,
  localComputeMode: 'auto',
  appearance: { theme: 'system', compactDensity: false, reducedMotion: false },
  export: {
    format: 'markdown',
    includeScreenshots: true,
    includeSubtitles: true,
    includeSourceMetadata: true,
    includeDiagnosticLog: false,
  },
  logLevel: 'info',
};

function savedPreferences(appearance: AppearancePreferences): AppPreferences {
  return { ...basePreferences, appearance };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function Harness() {
  const [preferences, setPreferences] = useState(basePreferences);
  return (
    <AppearanceSettings
      preferences={preferences}
      sidebarCollapsed={false}
      onPreferencesChanged={setPreferences}
      onToggleSidebar={() => {}}
    />
  );
}

describe('AppearanceSettings automatic persistence', () => {
  beforeEach(() => bridgeMocks.saveAppearancePreferences.mockReset());

  it('applies a theme immediately without a save button', async () => {
    bridgeMocks.saveAppearancePreferences.mockResolvedValue(savedPreferences({
      theme: 'light', compactDensity: false, reducedMotion: false,
    }));
    render(<Harness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '颜色主题' }));
    await user.click(screen.getByRole('option', { name: /浅色/ }));

    expect(screen.getByRole('button', { name: '颜色主题' }).textContent).toContain('浅色');
    expect(screen.queryByRole('button', { name: '保存外观设置' })).toBeNull();
    await waitFor(() => expect(bridgeMocks.saveAppearancePreferences).toHaveBeenCalledWith({
      theme: 'light', compactDensity: false, reducedMotion: false,
    }));
  });

  it('serializes rapid changes and rolls the latest failure back to the last saved state', async () => {
    const first = deferred<AppPreferences>();
    const second = deferred<AppPreferences>();
    bridgeMocks.saveAppearancePreferences
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(<Harness />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: '紧凑布局' }));
    await user.click(screen.getByRole('checkbox', { name: '减少动画' }));

    expect((screen.getByRole('checkbox', { name: '紧凑布局' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: '减少动画' }) as HTMLInputElement).checked).toBe(true);
    expect(bridgeMocks.saveAppearancePreferences).toHaveBeenCalledTimes(1);

    first.resolve(savedPreferences({ theme: 'system', compactDensity: true, reducedMotion: false }));
    await waitFor(() => expect(bridgeMocks.saveAppearancePreferences).toHaveBeenCalledTimes(2));
    second.reject(new Error('写入失败'));

    await screen.findByRole('alert');
    expect((screen.getByRole('checkbox', { name: '紧凑布局' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: '减少动画' }) as HTMLInputElement).checked).toBe(false);
  });
});
