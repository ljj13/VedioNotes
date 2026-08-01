/**
 *测试文件——测试 AiAccessTab 组件/模块的行为是否符合预期。
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPlatform } from '../../../platform/settings';
import AiAccessTab from './AiAccessTab';
import { resetProviderModelRegistryForTests } from '../../../platform/settings/aiModelRegistry';
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
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      summaryEligible: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
      capabilities: { reasoning: true, toolCall: true, structuredOutput: true },
      limit: { context: 1_000_000, output: 384_000 },
      cost: { input: 0.14, output: 0.28 },
    },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} },
    { id: 'gpt-3.5-legacy', name: 'GPT 3.5 Legacy', summaryEligible: true, status: 'deprecated', modalities: {}, capabilities: {}, limit: {}, cost: {} },
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

const revealCredentialMock = vi.fn<(...args: [string, string]) => Promise<string>>();
const fakeStoredApiKey = 'sk-test-not-a-real-secret';

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

async function openModelList() {
  fireEvent.click(screen.getByRole('button', { name: /^展开模型列表/ }));
  return screen.findByRole('listbox');
}

async function chooseModel(name: string) {
  await openModelList();
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(name, 'i') }));
}

// describe('AiAccessTab', () => {
describe('AiAccessTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    resetProviderModelRegistryForTests();
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
    revealCredentialMock.mockResolvedValue(fakeStoredApiKey);
    Object.assign(settingsPlatform.ai, { revealCredential: revealCredentialMock });
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

  it('uses one Select for providers and one searchable ComboBox for models', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');

    const selects = document.querySelectorAll('.cipher-settings-select');
    const triggers = document.querySelectorAll('[data-slot="select-trigger"]');
    expect(selects).toHaveLength(1);
    expect(triggers).toHaveLength(1);
    expect(Array.from(triggers).every((trigger) => trigger.classList.contains('cipher-settings-select-trigger'))).toBe(true);

    fireEvent.click(triggers[0] as HTMLElement);
    const listbox = await screen.findByRole('listbox');
    expect(listbox.classList.contains('cipher-settings-select-listbox')).toBe(true);
    expect(listbox.closest('[data-slot="select-popover"]')?.classList.contains('cipher-settings-select-popover')).toBe(true);
    expect(Array.from(listbox.querySelectorAll('[role="option"]')).every((option) => option.classList.contains('cipher-settings-select-option'))).toBe(true);
    expect(listbox.querySelector('[data-slot="list-box-item-indicator"]')?.classList.contains('cipher-settings-select-option-indicator')).toBe(true);

    fireEvent.click(await screen.findByRole('option', { name: /OpenAI openai/i }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await openModelList();
    const modelList = await screen.findByRole('listbox');
    expect(modelList.classList.contains('cipher-ai-model-list')).toBe(true);
    expect(modelList.closest('[data-slot="combo-box-popover"]')?.classList.contains('cipher-ai-model-popover')).toBe(true);
  });

  // it('displays all providers in the catalog', async () => {
  it('displays all providers in the catalog', async () => {
    render(<AiAccessTab {...baseProps} />);
    expect((await screen.findAllByText('OpenAI')).length).toBeGreaterThan(0);
    await openProviderList();
    expect(await screen.findByRole('option', { name: /Anthropic/i })).toBeTruthy();
  });

  it('uses the CipherTalk provider form structure and branded two-line options', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    expect(screen.queryByPlaceholderText(/搜索服务商/i)).toBeNull();
    expect(document.querySelector('.cipher-ai-access-grid')).toBeTruthy();
    expect(document.querySelector('.cipher-ai-provider-logo')).toBeTruthy();

    await openProviderList();
    const openAiOption = await screen.findByRole('option', { name: /OpenAI openai/i });
    expect(openAiOption.classList.contains('cipher-ai-provider-option')).toBe(true);
    expect(openAiOption.querySelector('.cipher-ai-provider-logo')).toBeTruthy();
    expect(openAiOption.textContent).toContain('openai');
  });

  it('shows the CipherTalk model capability strip and refresh control', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await chooseModel('GPT-4o$');

    expect(screen.getByRole('button', { name: '刷新模型列表' })).toBeTruthy();
    expect(screen.getByText('1000K')).toBeTruthy();
    expect(screen.getByText('384K')).toBeTruthy();
    expect(screen.getByText('$0.14/$0.28')).toBeTruthy();
    expect(screen.getByText('推理')).toBeTruthy();
    expect(screen.getByText('工具调用')).toBeTruthy();
    expect(screen.getByText('结构化输出')).toBeTruthy();
    expect(screen.getByText('图像输入')).toBeTruthy();
    expect(screen.getByText('内置模型目录')).toBeTruthy();
  });

  // it('selects a provider and shows eligible models', async ()
  it('selects a provider and shows eligible models', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await openModelList();
    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeTruthy();
      expect(screen.getByText('GPT-4o mini')).toBeTruthy();
    });
  });

  it('excludes ineligible and deprecated models from the selectable list', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await openModelList();
    expect(screen.queryByRole('option', { name: /O1 Preview/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /GPT 3.5 Legacy/i })).toBeNull();
  });

  it('filters only available models from the model input', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    const input = screen.getByRole('combobox', { name: '模型' });
    await openModelList();
    fireEvent.change(input, { target: { value: 'mini' } });
    expect(await screen.findByRole('option', { name: /GPT-4o mini/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^GPT-4o$/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /Legacy/i })).toBeNull();
  });

  it('keeps an unavailable saved model visible but requires reselection', async () => {
    const profiles = {
      ...baseProps.profiles,
      activeSummaryProfileId: 'catalog-openai',
      summaryProfiles: [{ id: 'catalog-openai', name: 'OpenAI', provider: 'open_ai_compatible' as const, baseUrl: mockProvider.baseUrl, model: 'gpt-3.5-legacy', enabled: true, builtIn: true }],
    };
    render(<AiAccessTab {...baseProps} profiles={profiles} />);
    const input = await screen.findByRole('combobox', { name: '模型' });
    expect((input as HTMLInputElement).value).toBe('gpt-3.5-legacy');
    expect(screen.getByText('当前模型已下架或不可用，请重新选择。')).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: '保存当前服务商' });
    expect(saveButton.hasAttribute('disabled') || saveButton.getAttribute('aria-disabled') === 'true' || saveButton.getAttribute('data-disabled') === 'true').toBe(true);
  });

  // it('shows API Key input for Anthropic protocol', async () =>
  it('shows API Key input for Anthropic protocol', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await chooseProvider('Anthropic');
    await openModelList();
    expect(await screen.findByRole('option', { name: 'Claude Sonnet 4' })).toBeTruthy();
    // API Key input should be visible (the bug fix: previously hidden for anthropic)
    expect(screen.getByPlaceholderText(/API Key/)).toBeTruthy();
  });

  it('hides API Key drafts by default and reveals only on request', async () => {
    render(<AiAccessTab {...baseProps} />);
    const input = await screen.findByPlaceholderText(/API Key/);
    expect(input.getAttribute('type')).toBe('password');
    fireEvent.change(input, { target: { value: 'sk-private-draft' } });
    fireEvent.click(screen.getByRole('button', { name: '显示 API 密钥' }));
    expect(input.getAttribute('type')).toBe('text');
    expect((input as HTMLInputElement).value).toBe('sk-private-draft');
    expect(screen.getByRole('button', { name: '隐藏 API 密钥' })).toBeTruthy();
  });

  it('reads a saved API Key only after the user requests reveal and hides it again', async () => {
    vi.mocked(settingsPlatform.ai.hasCredential).mockResolvedValue(true);
    render(<AiAccessTab {...baseProps} />);

    const input = await screen.findByPlaceholderText(/已保存，留空保持不变/);
    expect(input.getAttribute('type')).toBe('password');
    expect((input as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '显示 API 密钥' }));

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(fakeStoredApiKey));
    expect(input.getAttribute('type')).toBe('text');
    expect(revealCredentialMock).toHaveBeenCalledWith('summary', 'catalog-openai');

    fireEvent.click(screen.getByRole('button', { name: '隐藏 API 密钥' }));
    expect(input.getAttribute('type')).toBe('password');
    expect((input as HTMLInputElement).value).toBe('');
    expect(input.getAttribute('placeholder')).toContain('已保存');
  });

  it('clears a temporarily revealed stored API Key when the provider changes', async () => {
    vi.mocked(settingsPlatform.ai.hasCredential).mockResolvedValue(true);
    render(<AiAccessTab {...baseProps} />);

    const input = await screen.findByPlaceholderText(/已保存，留空保持不变/);
    fireEvent.click(screen.getByRole('button', { name: '显示 API 密钥' }));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(fakeStoredApiKey));

    await chooseProvider('Anthropic');

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
    expect(input.getAttribute('type')).toBe('password');
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
    await chooseModel('GPT-4o$');

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
    // Save button should exist but be disabled (HeroUI uses aria-disabled or disabled)
    const saveButton = screen.getByRole('button', { name: '保存当前服务商' });
    expect(saveButton).toBeTruthy();
    expect(saveButton.hasAttribute('disabled') || saveButton.getAttribute('aria-disabled') === 'true' || saveButton.getAttribute('data-disabled') === 'true').toBe(true);
  });

  it('uses a successful remote refresh as the authoritative available model list', async () => {
    vi.spyOn(settingsPlatform.ai, 'discoverModels').mockResolvedValue(['gpt-4o-mini']);
    const profiles = {
      ...baseProps.profiles,
      activeSummaryProfileId: 'catalog-openai',
      summaryProfiles: [{ id: 'catalog-openai', name: 'OpenAI', provider: 'open_ai_compatible' as const, baseUrl: mockProvider.baseUrl, model: 'gpt-4o', enabled: true, builtIn: true }],
    };
    render(<AiAccessTab {...baseProps} profiles={profiles} />);
    await screen.findAllByText('OpenAI');
    fireEvent.click(screen.getByRole('button', { name: '刷新模型列表' }));
    await waitFor(() => expect(settingsPlatform.ai.discoverModels).toHaveBeenCalledWith('catalog-openai'));
    await openModelList();
    expect(await screen.findByRole('option', { name: /GPT-4o mini/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^GPT-4o$/i })).toBeNull();
    expect(screen.getByText('当前模型已下架或不可用，请重新选择。')).toBeTruthy();
  });

  it('does not expose an unknown remote ASR model in the summary picker', async () => {
    vi.spyOn(settingsPlatform.ai, 'discoverModels').mockResolvedValue(['gpt-4o-mini', 'mimo-v2.5-asr']);
    const profiles = {
      ...baseProps.profiles,
      activeSummaryProfileId: 'catalog-openai',
      summaryProfiles: [{ id: 'catalog-openai', name: 'OpenAI', provider: 'open_ai_compatible' as const, baseUrl: mockProvider.baseUrl, model: 'gpt-4o-mini', enabled: true, builtIn: true }],
    };
    render(<AiAccessTab {...baseProps} profiles={profiles} />);
    await screen.findAllByText('OpenAI');
    fireEvent.click(screen.getByRole('button', { name: '刷新模型列表' }));
    await waitFor(() => expect(settingsPlatform.ai.discoverModels).toHaveBeenCalledWith('catalog-openai'));
    await openModelList();
    expect(await screen.findByRole('option', { name: /GPT-4o mini/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /mimo-v2.5-asr/i })).toBeNull();
  });

  it('marks the provider address as a single-line titled value', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    const address = document.querySelector('.cipher-ai-provider-address');
    expect(address).toBeTruthy();
    expect(address?.getAttribute('title')).toBe(mockProvider.baseUrl);
  });

  // it('displays protocol labels for each provider', async () =>
  it('displays protocol labels for each provider', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findAllByText('OpenAI');
    await waitFor(() => {
      // Should show the protocol label (OpenAI Compatible)
      expect(screen.getAllByText('OpenAI Compatible').length).toBeGreaterThanOrEqual(1);
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
