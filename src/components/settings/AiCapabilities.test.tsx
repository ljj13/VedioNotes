import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppProfiles, CapabilitySettings, CapabilityStatus } from '../../lib/types';
import SettingsWorkspace from '../SettingsWorkspace';

const bridge = vi.hoisted(() => ({
  getCapabilitySettings: vi.fn(),
  getCapabilityStatus: vi.fn(),
  getSummaryProviderCatalog: vi.fn(),
  saveAndActivateCatalogSummaryProfile: vi.fn(),
  saveVectorConfig: vi.fn(),
  saveRerankConfig: vi.fn(),
  saveWebSearchConfig: vi.fn(),
  saveTtsConfig: vi.fn(),
  saveImageConfig: vi.fn(),
  saveLocalAgentConfig: vi.fn(),
  testVectorConfig: vi.fn(),
  testRerankConfig: vi.fn(),
  testWebSearchConfig: vi.fn(),
  testTtsConfig: vi.fn(),
  testImageConfig: vi.fn(),
  testLocalAgentConfig: vi.fn(),
  detectLocalAgents: vi.fn(),
  saveSummaryProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  setTranscriptionPreferences: vi.fn(),
  getDiagnosticLogPath: vi.fn(),
}));
vi.mock('../../lib/bridge', () => bridge);
vi.mock('../ProfileManager', () => ({ default: () => <div aria-label="summary profile manager">profiles</div> }));
vi.mock('../LocalModelManager', () => ({ default: () => <div /> }));
vi.mock('../CudaRuntimeManager', () => ({ default: () => <div /> }));
vi.mock('../DownloadSettings', () => ({ default: () => <div /> }));
vi.mock('../OutputSettings', () => ({ default: () => <div /> }));
vi.mock('../SenseVoiceManager', () => ({ default: () => <div /> }));

const settings: CapabilitySettings = {
  schemaVersion: 1,
  vector: { enabled: false, providerId: 'vector-default', endpoint: '', model: '', collection: 'notes', dimensions: null },
  rerank: { enabled: false, providerId: 'rerank-default', endpoint: '', model: '' },
  webSearch: { enabled: false, providerId: 'tavily', endpoint: '', maxResults: 5 },
  tts: { enabled: false, providerId: 'mimo', endpoint: '', model: '', voice: '' },
  image: { enabled: false, providerId: 'openai', endpoint: '', model: '', size: '1024x1024' },
  localAgent: { enabled: false, providerId: 'codex', executable: '', arguments: [], timeoutSeconds: 120 },
};

const disabledItem = { enabled: false, configured: false, credentialReady: false, providerId: '' };
const status: CapabilityStatus = {
  vector: { ...disabledItem, providerId: settings.vector.providerId },
  rerank: { ...disabledItem, providerId: settings.rerank.providerId },
  webSearch: { ...disabledItem, providerId: settings.webSearch.providerId },
  tts: { ...disabledItem, providerId: settings.tts.providerId },
  image: { ...disabledItem, providerId: settings.image.providerId },
  localAgent: { ...disabledItem, providerId: settings.localAgent.providerId },
};

const profiles: AppProfiles = {
  schemaVersion: 1,
  activeTranscriptionProfileId: null,
  activeSummaryProfileId: 'deepseek',
  fallbackTranscriptionProfileId: null,
  migrationRequired: false,
  transcriptionProfiles: [],
  summaryProfiles: [{ id: 'deepseek', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: true }],
};

const props = {
  section: 'ai' as const,
  profiles,
  localModels: [],
  preferences: { schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto' as const },
  theme: 'dark' as const,
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

describe('AI capability settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getCapabilitySettings.mockResolvedValue(settings);
    bridge.getCapabilityStatus.mockResolvedValue(status);
    bridge.getSummaryProviderCatalog.mockResolvedValue([{ id: 'deepseek', displayName: 'DeepSeek', description: 'DeepSeek', protocol: 'openai-compatible', baseUrl: 'https://api.deepseek.com', npmPackage: '@ai-sdk/openai-compatible', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', summaryEligible: true, modalities: {}, capabilities: {}, limit: {}, cost: {} }] }]);
    bridge.saveAndActivateCatalogSummaryProfile.mockResolvedValue(profiles);
    bridge.detectLocalAgents.mockResolvedValue([{ providerId: 'codex', configured: false, executableFound: false }]);
    for (const name of ['saveVectorConfig', 'saveRerankConfig', 'saveWebSearchConfig', 'saveTtsConfig', 'saveImageConfig', 'saveLocalAgentConfig'] as const) {
      bridge[name].mockResolvedValue({ enabled: true, configured: true, credentialReady: true, providerId: 'saved' });
    }
    for (const name of ['testVectorConfig', 'testRerankConfig', 'testWebSearchConfig', 'testTtsConfig', 'testImageConfig', 'testLocalAgentConfig'] as const) {
      bridge[name].mockResolvedValue({ ok: true, message: '连接测试通过' });
    }
  });

  it('renders all seven AI subtabs and persists a custom vector provider through the typed bridge', async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...props} />);

    for (const tab of ['大模型', '向量', '重排', '联网', '语音', '作图', '本地智能体']) {
      expect(screen.getByRole('tab', { name: tab })).toBeTruthy();
    }

    await user.click(screen.getByRole('tab', { name: '向量' }));
    await screen.findByRole('button', { name: '保存向量配置' });
    await user.click(screen.getByRole('checkbox', { name: '启用向量能力' }));
    fireEvent.change(screen.getByRole('textbox', { name: '向量服务商标识' }), { target: { value: 'my-vector' } });
    fireEvent.change(screen.getByRole('textbox', { name: '向量接口地址' }), { target: { value: 'https://vector.example.test/v1/embeddings' } });
    fireEvent.change(screen.getByRole('textbox', { name: '向量模型' }), { target: { value: 'embed-model' } });
    fireEvent.change(screen.getByLabelText('向量 API Key'), { target: { value: 'synthetic-key' } });
    await user.click(screen.getByRole('button', { name: '保存向量配置' }));

    await waitFor(() => expect(bridge.saveVectorConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, providerId: 'my-vector', model: 'embed-model' }),
      { type: 'bearer', apiKey: 'synthetic-key' },
    ));
    await user.click(screen.getByRole('button', { name: '测试向量配置' }));
    expect(bridge.testVectorConfig).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('连接测试通过')).toBeTruthy();
  });

  it('wires every non-LLM capability test action and keeps each panel independently reachable', async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...props} />);

    const cases = [
      ['重排', '测试重排配置', bridge.testRerankConfig],
      ['联网', '测试联网配置', bridge.testWebSearchConfig],
      ['语音', '测试语音配置', bridge.testTtsConfig],
      ['作图', '测试作图配置', bridge.testImageConfig],
      ['本地智能体', '测试本地智能体配置', bridge.testLocalAgentConfig],
    ] as const;

    for (const [tab, action, fn] of cases) {
      await user.click(screen.getByRole('tab', { name: tab }));
      await user.click(await screen.findByRole('button', { name: action }));
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    }
  });
});
