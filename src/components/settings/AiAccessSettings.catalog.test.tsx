import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppProfiles, SummaryProviderCatalogEntry } from '../../lib/types';
import AiAccessSettings from './AiAccessSettings';

const bridgeMocks = vi.hoisted(() => ({
  getCapabilitySettings: vi.fn(),
  getCapabilityStatus: vi.fn(),
  getSummaryProviderCatalog: vi.fn(),
  saveAndActivateCatalogSummaryProfile: vi.fn(),
  setActiveProfile: vi.fn(),
}));

vi.mock('../../lib/bridge', () => ({
  getCapabilitySettings: bridgeMocks.getCapabilitySettings,
  getCapabilityStatus: bridgeMocks.getCapabilityStatus,
  getSummaryProviderCatalog: bridgeMocks.getSummaryProviderCatalog,
  saveAndActivateCatalogSummaryProfile: bridgeMocks.saveAndActivateCatalogSummaryProfile,
  setActiveProfile: bridgeMocks.setActiveProfile,
  saveSummaryProfile: vi.fn(),
}));

vi.mock('../ProfileManager', () => ({
  default: () => <div aria-label="自定义总结配置管理">custom profiles</div>,
}));

const catalog: SummaryProviderCatalogEntry[] = [
  {
    id: 'alpha', displayName: 'Alpha AI', description: 'OpenAI-compatible provider',
    protocol: 'openai-compatible', baseUrl: 'https://alpha.example/v1', npmPackage: '@ai-sdk/openai-compatible',
    models: [
      { id: 'alpha-chat', name: 'Alpha Chat', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
      { id: 'alpha-audio', name: 'Alpha Audio', summaryEligible: false, summaryIneligibleReason: '不支持文本输出', modalities: {}, capabilities: {}, limit: {}, cost: {} },
    ],
  },
  {
    id: 'beta', displayName: 'Beta Claude', description: 'Anthropic protocol provider',
    protocol: 'anthropic', baseUrl: 'https://beta.example', npmPackage: '@ai-sdk/anthropic',
    models: [
      { id: 'beta-sonnet', name: 'Beta Sonnet', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
    ],
  },
];

const profiles: AppProfiles = {
  schemaVersion: 1,
  activeTranscriptionProfileId: null,
  activeSummaryProfileId: 'catalog-alpha',
  fallbackTranscriptionProfileId: null,
  migrationRequired: false,
  transcriptionProfiles: [],
  summaryProfiles: [
    { id: 'catalog-alpha', name: 'Alpha AI', provider: 'open_ai_compatible', baseUrl: 'https://alpha.example/v1', model: 'alpha-chat', enabled: true, builtIn: true },
  ],
};

describe('AI provider catalog workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.getSummaryProviderCatalog.mockResolvedValue(catalog);
    bridgeMocks.getCapabilitySettings.mockResolvedValue(null);
    bridgeMocks.getCapabilityStatus.mockResolvedValue(null);
    bridgeMocks.saveAndActivateCatalogSummaryProfile.mockResolvedValue(profiles);
  });

  it('keeps provider/model changes as a draft until atomic save and activation', async () => {
    const onProfilesChanged = vi.fn();
    render(<AiAccessSettings profiles={profiles} onProfilesChanged={onProfilesChanged} />);
    const user = userEvent.setup();

    const providerInput = await screen.findByRole('combobox', { name: '搜索 AI 服务商' });
    await user.clear(providerInput);
    await user.type(providerInput, 'Beta');
    await user.click(screen.getByRole('option', { name: /Beta Claude/ }));

    expect(bridgeMocks.setActiveProfile).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('https://beta.example')).toBeTruthy();
    expect(screen.getAllByText('Anthropic Messages')).toHaveLength(2);

    const modelInput = screen.getByRole('combobox', { name: '搜索或输入 AI 模型' });
    await user.clear(modelInput);
    await user.type(modelInput, 'beta-sonnet');
    await user.click(screen.getByRole('option', { name: /Beta Sonnet/ }));
    await user.type(screen.getByLabelText('AI API Key'), 'secret-for-test');
    await user.click(screen.getByRole('button', { name: '保存并启用' }));

    await waitFor(() => expect(bridgeMocks.saveAndActivateCatalogSummaryProfile).toHaveBeenCalledWith({
      providerId: 'beta',
      model: 'beta-sonnet',
      baseUrlOverride: undefined,
      credential: { type: 'bearer', apiKey: 'secret-for-test' },
    }));
    expect(onProfilesChanged).toHaveBeenCalledTimes(1);
  });

  it('shows ineligible catalog models as disabled with the backend reason', async () => {
    render(<AiAccessSettings profiles={profiles} onProfilesChanged={() => {}} />);
    const user = userEvent.setup();
    const modelInput = await screen.findByRole('combobox', { name: '搜索或输入 AI 模型' });
    await user.clear(modelInput);
    await user.type(modelInput, 'audio');

    const listbox = screen.getByRole('listbox', { name: 'AI 模型选项' });
    const option = within(listbox).getByRole('option', { name: /Alpha Audio/ });
    expect(option.getAttribute('aria-disabled')).toBe('true');
    expect(option.textContent).toContain('不支持文本输出');
  });
});
