/**
 *测试文件——测试 AiAccessTab 组件/模块的行为是否符合预期。
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPlatform } from '../../../platform/settings';
import AiAccessTab from './AiAccessTab';
import type { SettingsEntryProps } from '../settingsTypes';
import type { SummaryProviderCatalogEntry } from '../../../lib/types';

vi.mock('@tauri-apps/api', () => ({}));

const mockProvider: SummaryProviderCatalogEntry = {
  id: 'openai',
  displayName: 'OpenAI',
  description: 'GPT models',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  documentationUrl: 'https://platform.openai.com/docs',
  npmPackage: 'openai',
  models: [
    { id: 'gpt-4o', name: 'GPT-4o', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
    { id: 'o1-preview', name: 'O1 Preview', summaryEligible: false, summaryIneligibleReason: 'No system prompt', modalities: {}, capabilities: {}, limit: {}, cost: {} },
  ],
};

const anthropicProvider: SummaryProviderCatalogEntry = {
  id: 'anthropic',
  displayName: 'Anthropic',
  description: 'Claude models',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  npmPackage: '@anthropic-ai/sdk',
  models: [
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
  ],
};

const baseProps: SettingsEntryProps = {
  section: 'ai',
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [],
  preferences: { schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', appearance: { theme: 'system', compactDensity: false, reducedMotion: false } },
  theme: 'dark',
  sidebarCollapsed: false,
  onSelectSection: vi.fn(),
  onReturn: vi.fn(),
  onProfilesChanged: vi.fn(),
  onModelsChanged: vi.fn(),
  onPreferencesChanged: vi.fn(),
  onSenseVoiceStatusChanged: vi.fn(),
  onToggleTheme: vi.fn(),
  onToggleSidebar: vi.fn(),
};

function providerTrigger() {
  return document.querySelector('[data-slot="select-trigger"]') as HTMLElement;
}

async function openProviderList() {
  fireEvent.click(providerTrigger());
  return screen.findByRole('listbox');
}

async function chooseProvider(name: string) {
  await openProviderList();
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(name, 'i') }));
}

// describe('AiAccessTab', () => {
describe('AiAccessTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(settingsPlatform.ai, 'getCatalog').mockResolvedValue([mockProvider, anthropicProvider]);
    vi.spyOn(settingsPlatform.ai, 'getCapabilitySettings').mockResolvedValue(null as any);
    vi.spyOn(settingsPlatform.ai, 'getCapabilityStatus').mockResolvedValue({
      vector: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      rerank: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      webSearch: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      tts: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      image: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      localAgent: { enabled: false, configured: false, credentialReady: false, providerId: '' },
    } as any);
    vi.spyOn(settingsPlatform.ai, 'hasCredential').mockResolvedValue(false);
    vi.spyOn(settingsPlatform.ai, 'saveAndActivate').mockResolvedValue({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: 'openai:gpt-4o', fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] });
    vi.spyOn(settingsPlatform.ai, 'testProfile').mockResolvedValue({ success: true, message: '连接正常', latencyMs: 32 });
  });

  // it('renders AI access heading', async () => {
  it('renders AI access heading', async () => {
    render(<AiAccessTab {...baseProps} />);
    expect(await screen.findByRole('heading', { name: 'AI 接入配置' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '添加预设' })).toBeNull();
    expect(screen.queryByRole('button', { name: '预设管理' })).toBeNull();
    await waitFor(() => expect(settingsPlatform.ai.hasCredential).toHaveBeenCalledWith('summary', 'catalog-openai'));
  });

  it('assigns explicit settings slot classes to both select popovers', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');

    const selects = document.querySelectorAll('.cipher-settings-select');
    const triggers = document.querySelectorAll('[data-slot="select-trigger"]');
    expect(selects).toHaveLength(2);
    expect(triggers).toHaveLength(2);
    expect(Array.from(triggers).every((trigger) => trigger.classList.contains('cipher-settings-select-trigger'))).toBe(true);

    fireEvent.click(triggers[0] as HTMLElement);
    const listbox = await screen.findByRole('listbox');
    expect(listbox.classList.contains('cipher-settings-select-listbox')).toBe(true);
    expect(listbox.closest('[data-slot="select-popover"]')?.classList.contains('cipher-settings-select-popover')).toBe(true);
    expect(Array.from(listbox.querySelectorAll('[role="option"]')).every((option) => option.classList.contains('cipher-settings-select-option'))).toBe(true);
    expect(listbox.querySelector('[data-slot="list-box-item-indicator"]')?.classList.contains('cipher-settings-select-option-indicator')).toBe(true);
  });

  // it('displays all providers in the catalog', async () => {
  it('displays all providers in the catalog', async () => {
    render(<AiAccessTab {...baseProps} />);
    expect((await screen.findAllByText('OpenAI')).length).toBeGreaterThan(0);
    await openProviderList();
    expect(await screen.findByRole('option', { name: /Anthropic/i })).toBeTruthy();
  });

  // it('filters providers by search query', async () => {
  it('filters providers by search query', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    fireEvent.change(screen.getByPlaceholderText(/搜索/i), { target: { value: 'anthropic' } });
    await openProviderList();
    expect(await screen.findByRole('option', { name: /Anthropic/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^OpenAI/i })).toBeNull();
  });

  // it('selects a provider and shows eligible models', async ()
  it('selects a provider and shows eligible models', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeTruthy();
      expect(screen.getByText('GPT-4o mini')).toBeTruthy();
    });
  });

  // it('disables ineligible models and shows reason', async () =
  it('disables ineligible models and shows reason', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    const triggers = document.querySelectorAll('[data-slot="select-trigger"]');
    fireEvent.click(triggers[1] as HTMLElement);
    const disabledModel = await screen.findByRole('option', { name: /O1 Preview/i });
    expect(disabledModel.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('No system prompt')).toBeTruthy();
  });

  // it('shows API Key input for Anthropic protocol', async () =>
  it('shows API Key input for Anthropic protocol', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await chooseProvider('Anthropic');
    await screen.findByText('Claude Sonnet 4');
    // API Key input should be visible (the bug fix: previously hidden for anthropic)
    expect(screen.getByPlaceholderText(/API Key/)).toBeTruthy();
  });

  // it('shows credential status as missing when no credential sa
  it('shows credential status as missing when no credential saved', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await waitFor(() => {
      expect(screen.getByText('未保存')).toBeTruthy();
    });
  });

  // it('shows credential status as saved when hasCredential retu
  it('shows credential status as saved when hasCredential returns true', async () => {
    vi.spyOn(settingsPlatform.ai, 'hasCredential').mockResolvedValue(true);
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await waitFor(() => {
      expect(screen.getByText('已保存')).toBeTruthy();
    });
    expect(screen.queryByText('sk-3***00c0')).toBeNull();
    expect(screen.queryByDisplayValue(/sk-test|secret/i)).toBeNull();
  });

  it('tests the persisted catalog profile through the typed platform and reports backend failure', async () => {
    vi.mocked(settingsPlatform.ai.testProfile).mockResolvedValue({ success: false, message: '401 Unauthorized', latencyMs: 18 });
    const profiles = {
      ...baseProps.profiles,
      activeSummaryProfileId: 'catalog-openai',
      summaryProfiles: [{ id: 'catalog-openai', name: 'OpenAI', provider: 'open_ai_compatible' as const, baseUrl: mockProvider.baseUrl, model: 'gpt-4o', enabled: true, builtIn: true }],
    };
    render(<AiAccessTab {...baseProps} profiles={profiles} />);
    await screen.findAllByText('OpenAI');
    const triggers = document.querySelectorAll('[data-slot="select-trigger"]');
    fireEvent.click(triggers[1] as HTMLElement);
    fireEvent.click(await screen.findByRole('option', { name: /GPT-4o$/i }));
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(settingsPlatform.ai.testProfile).toHaveBeenCalledWith('summary', 'catalog-openai'));
    expect(await screen.findByText('连接失败: 401 Unauthorized')).toBeTruthy();
  });

  // it('selects model, enters API Key, and saves profile', async
  it('selects model, enters API Key, and saves profile', async () => {
    const mockProfiles = { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: 'openai:gpt-4o', fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] };
    vi.spyOn(settingsPlatform.ai, 'saveAndActivate').mockResolvedValue(mockProfiles);
    const onProfilesChanged = vi.fn();

    render(<AiAccessTab {...baseProps} onProfilesChanged={onProfilesChanged} />);
    await screen.findAllByText('OpenAI');
    await screen.findByText('GPT-4o');
    // Select model via the select element
    const triggers = document.querySelectorAll('[data-slot="select-trigger"]');
    fireEvent.click(triggers[1] as HTMLElement);
    fireEvent.click(await screen.findByRole('option', { name: /GPT-4o$/i }));

    // Enter API Key through the current controlled credential draft.
    fireEvent.change(await screen.findByPlaceholderText(/API Key/), { target: { value: 'sk-test123' } });

    // The current UI names the activation action after the selected provider.
    fireEvent.click(screen.getByRole('button', { name: '保存当前服务商' }));

    await waitFor(() => {
      expect(settingsPlatform.ai.saveAndActivate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'openai',
          model: 'gpt-4o',
        }),
      );
      expect(onProfilesChanged).toHaveBeenCalled();
    });
  });

  // it('disables save button when no model is selected', async (
  it('disables save button when no model is selected', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await screen.findByText('GPT-4o');
    // Save button should exist but be disabled (HeroUI uses aria-disabled or disabled)
    const saveButton = screen.getByRole('button', { name: '保存当前服务商' });
    expect(saveButton).toBeTruthy();
    expect(saveButton.hasAttribute('disabled') || saveButton.getAttribute('aria-disabled') === 'true' || saveButton.getAttribute('data-disabled') === 'true').toBe(true);
  });

  // it('displays protocol labels for each provider', async () =>
  it('displays protocol labels for each provider', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await waitFor(() => {
      // Should show the protocol label (OpenAI Compatible)
      expect(screen.getAllByText('OpenAI Compatible').length).toBeGreaterThanOrEqual(2);
    });
  });

  // it('switches to capability sub-tabs and loads settings', asy
  it('switches to capability sub-tabs and loads settings', async () => {
    vi.spyOn(settingsPlatform.ai, 'getCapabilitySettings').mockResolvedValue({
      schemaVersion: 1,
      vector: { enabled: false, providerId: '', endpoint: '', model: '', collection: '', dimensions: null },
      rerank: { enabled: false, providerId: '', endpoint: '', model: '' },
      webSearch: { enabled: false, providerId: '', endpoint: '', maxResults: 5 },
      tts: { enabled: false, providerId: '', endpoint: '', model: '', voice: '' },
      image: { enabled: false, providerId: '', endpoint: '', model: '', size: '1024x1024' },
      localAgent: { enabled: false, providerId: '', executable: '', arguments: [], timeoutSeconds: 120 },
    } as any);
    vi.spyOn(settingsPlatform.ai, 'getCapabilityStatus').mockResolvedValue({
      vector: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      rerank: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      webSearch: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      tts: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      image: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      localAgent: { enabled: false, configured: false, credentialReady: false, providerId: '' },
    } as any);
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    // Click on a capability sub-tab
    const vectorTab = screen.getByText('向量');
    expect(vectorTab).toBeTruthy();
    fireEvent.click(vectorTab);
    await waitFor(() => {
      expect(settingsPlatform.ai.getCapabilitySettings).toHaveBeenCalled();
    });
  });
});
