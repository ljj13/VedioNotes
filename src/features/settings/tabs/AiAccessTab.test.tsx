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

describe('AiAccessTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(settingsPlatform.ai, 'getCatalog').mockResolvedValue([mockProvider, anthropicProvider]);
    vi.spyOn(settingsPlatform.ai, 'getCapabilitySettings').mockResolvedValue(null);
    vi.spyOn(settingsPlatform.ai, 'getCapabilityStatus').mockResolvedValue({});
    vi.spyOn(settingsPlatform.ai, 'hasCredential').mockResolvedValue(false);
    vi.spyOn(settingsPlatform.ai, 'saveAndActivate').mockResolvedValue({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: 'openai:gpt-4o', fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] });
  });

  it('renders AI access heading', async () => {
    render(<AiAccessTab {...baseProps} />);
    expect(await screen.findByText('AI 接入')).toBeTruthy();
  });

  it('displays all providers in the catalog', async () => {
    render(<AiAccessTab {...baseProps} />);
    expect(await screen.findByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Anthropic')).toBeTruthy();
  });

  it('filters providers by search query', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    const searchInput = screen.getByPlaceholderText(/搜索/i);
    expect(searchInput).toBeTruthy();
    fireEvent.change(searchInput, { target: { value: 'anthropic' } });
    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeTruthy();
      expect(screen.queryByText('OpenAI')).toBeNull();
    });
  });

  it('selects a provider and shows eligible models', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeTruthy();
      expect(screen.getByText('GPT-4o mini')).toBeTruthy();
    });
  });

  it('disables ineligible models and shows reason', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await waitFor(() => {
      // The ineligible model option includes the reason in its text
      const ineligibleOption = screen.getByText(/O1 Preview/);
      expect(ineligibleOption).toBeTruthy();
      const parent = ineligibleOption.closest('option') || ineligibleOption;
      expect(parent.textContent).toContain('No system prompt');
    });
  });

  it('shows API Key input for Anthropic protocol', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('Anthropic');
    fireEvent.click(screen.getByText('Anthropic'));
    await screen.findByText('Claude Sonnet 4');
    // API Key input should be visible (the bug fix: previously hidden for anthropic)
    expect(screen.getByPlaceholderText(/API Key/)).toBeTruthy();
  });

  it('shows credential status as missing when no credential saved', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await waitFor(() => {
      expect(screen.getByText(/凭据未设置/)).toBeTruthy();
    });
  });

  it('shows credential status as saved when hasCredential returns true', async () => {
    vi.spyOn(settingsPlatform.ai, 'hasCredential').mockResolvedValue(true);
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await waitFor(() => {
      expect(screen.getByText(/凭据已保存/)).toBeTruthy();
    });
  });

  it('selects model, enters API Key, and saves profile', async () => {
    const mockProfiles = { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: 'openai:gpt-4o', fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] };
    vi.spyOn(settingsPlatform.ai, 'saveAndActivate').mockResolvedValue(mockProfiles);
    const onProfilesChanged = vi.fn();

    render(<AiAccessTab {...baseProps} onProfilesChanged={onProfilesChanged} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await screen.findByText('GPT-4o');
    // Select model via the select element
    const modelSelect = screen.getByRole('combobox');
    if (modelSelect) {
      fireEvent.change(modelSelect, { target: { value: 'gpt-4o' } });
    } else {
      fireEvent.click(screen.getByText('GPT-4o'));
    }

    // Enter API Key
    await waitFor(() => {
      const apiKeyInput = screen.queryByPlaceholderText(/API Key/);
      if (apiKeyInput) {
        fireEvent.change(apiKeyInput, { target: { value: 'sk-test123' } });
      }
    });

    // Click save button
    await waitFor(() => {
      const saveButton = screen.queryByText('保存并激活');
      if (saveButton) {
        fireEvent.click(saveButton);
      }
    });

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

  it('disables save button when no model is selected', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await screen.findByText('GPT-4o');
    // Save button should exist but be disabled (HeroUI uses aria-disabled or disabled)
    const saveButton = screen.getByText('保存并激活');
    expect(saveButton).toBeTruthy();
    const button = saveButton.closest('button');
    expect(button?.disabled === true || button?.getAttribute('aria-disabled') === 'true' || button?.getAttribute('data-disabled') === 'true').toBe(true);
  });

  it('displays protocol labels for each provider', async () => {
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByText('OpenAI'));
    await waitFor(() => {
      // Should show the protocol label (OpenAI Compatible)
      expect(screen.getByText('OpenAI Compatible')).toBeTruthy();
    });
  });

  it('switches to capability sub-tabs and loads settings', async () => {
    vi.spyOn(settingsPlatform.ai, 'getCapabilitySettings').mockResolvedValue({
      vector: { enabled: false, providerId: '', endpoint: '', model: '', collection: '', dimensions: null },
    });
    vi.spyOn(settingsPlatform.ai, 'getCapabilityStatus').mockResolvedValue({
      vector: { enabled: false },
    });
    render(<AiAccessTab {...baseProps} />);
    await screen.findByText('OpenAI');
    // Click on a capability sub-tab
    const vectorTab = screen.getByText('向量');
    expect(vectorTab).toBeTruthy();
    fireEvent.click(vectorTab);
    await waitFor(() => {
      expect(settingsPlatform.ai.getCapabilitySettings).toHaveBeenCalled();
    });
  });
});
