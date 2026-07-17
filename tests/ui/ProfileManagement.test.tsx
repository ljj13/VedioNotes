import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import ProfileSelectors from '../../src/components/ProfileSelectors';
import type { AppProfiles, ProviderFallbackEvent } from '../../src/lib/types';

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_DISTILLATION = {
  core_conclusion: '这是视频的核心结论',
  key_evidence: [
    { text: '关键依据一' },
    { text: '关键依据二', timestamp_seconds: 30 },
    { text: '关键依据三', screenshot_path: 'screenshots/three.png' },
  ],
  implications: ['采取行动一', '注意边界条件'],
};

const MOCK_RESULT = {
  task_id: 'mock-task-123',
  distillation: MOCK_DISTILLATION,
  saved_path: 'C:\\Users\\test\\Videos\\video-distiller\\video-核心提炼.md',
};

const MOCK_PROFILES: AppProfiles = {
  schemaVersion: 1,
  activeTranscriptionProfileId: 'tencent-flash',
  activeSummaryProfileId: 'deepseek-main',
  fallbackTranscriptionProfileId: null,
  transcriptionProfiles: [
    { id: 'tencent-flash', name: '腾讯云极速版', provider: 'tencent_flash', baseUrl: 'https://asr.cloud.tencent.com', model: '16k_zh', enabled: true, builtIn: true },
    { id: 'mimo-asr', name: 'MiMo ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: true },
    { id: 'custom-asr', name: '自定义 ASR', provider: 'open_ai_compatible', baseUrl: 'https://custom.example.com', model: 'whisper-1', enabled: false, builtIn: false },
    { id: 'no-cred-asr', name: '无凭据ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: false },
  ],
  summaryProfiles: [
    { id: 'deepseek-main', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: true },
    { id: 'mimo-summary', name: 'MiMo Summary', provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5', enabled: true, builtIn: true },
    { id: 'no-cred-summary', name: '无凭据总结', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: false },
  ],
};

// ── Mock Infrastructure ───────────────────────────────────────────────────────

type ListenerEntry = { event: string; handler: (payload: unknown) => void };
let registeredListeners: ListenerEntry[] = [];

// Use globalThis for shared state since vi.mock factory is hoisted
vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__mockInvokeImpl__ = null;
});

vi.mock('uuid', () => ({ v4: () => 'uuid-from-mock-789' }));

vi.mock('@tauri-apps/api/core', () => {
  const MOCK_PROFILES_COPY: AppProfiles = JSON.parse(JSON.stringify({
    schemaVersion: 1,
    activeTranscriptionProfileId: 'tencent-flash',
    activeSummaryProfileId: 'deepseek-main',
    fallbackTranscriptionProfileId: null,
    transcriptionProfiles: [
      { id: 'tencent-flash', name: '腾讯云极速版', provider: 'tencent_flash', baseUrl: 'https://asr.cloud.tencent.com', model: '16k_zh', enabled: true, builtIn: true },
      { id: 'mimo-asr', name: 'MiMo ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: true },
      { id: 'custom-asr', name: '自定义 ASR', provider: 'open_ai_compatible', baseUrl: 'https://custom.example.com', model: 'whisper-1', enabled: false, builtIn: false },
      { id: 'no-cred-asr', name: '无凭据ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: false },
    ],
    summaryProfiles: [
      { id: 'deepseek-main', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: true },
      { id: 'mimo-summary', name: 'MiMo Summary', provider: 'mimo', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5', enabled: true, builtIn: true },
      { id: 'no-cred-summary', name: '无凭据总结', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: false },
    ],
  }));

  const spy = vi.fn((cmd: string, args?: Record<string, unknown>) => {
    // If a test-specific implementation is set, use it
    const overridden = (globalThis as Record<string, unknown>).__mockInvokeImpl__ as ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null;
    if (overridden) return overridden(cmd, args);
    // Default implementation
    if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES_COPY)));
    if (cmd === 'has_profile_credential') return Promise.resolve(true);
    if (cmd === 'set_active_profile') {
      const p = JSON.parse(JSON.stringify(MOCK_PROFILES_COPY));
      if (args?.profileType === 'transcription') p.activeTranscriptionProfileId = args?.profileId;
      else p.activeSummaryProfileId = args?.profileId;
      return Promise.resolve(p);
    }
    if (cmd === 'set_fallback_transcription_profile') {
      const p = JSON.parse(JSON.stringify(MOCK_PROFILES_COPY));
      p.fallbackTranscriptionProfileId = args?.profileId ?? null;
      return Promise.resolve(p);
    }
    if (cmd === 'save_transcription_profile' || cmd === 'save_summary_profile') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES_COPY)));
    if (cmd === 'delete_profile') {
      const p = JSON.parse(JSON.stringify(MOCK_PROFILES_COPY));
      if (args?.profileType === 'transcription') p.transcriptionProfiles = p.transcriptionProfiles.filter((x: { id: string }) => x.id !== args?.profileId);
      else p.summaryProfiles = p.summaryProfiles.filter((x: { id: string }) => x.id !== args?.profileId);
      return Promise.resolve(p);
    }
    if (cmd === 'test_profile') return Promise.resolve({ success: true, message: '测试成功', latencyMs: null });
    if (cmd === 'discover_summary_models') return Promise.resolve(['deepseek-chat', 'deepseek-reasoner']);
    if (cmd === 'start_distillation') return Promise.resolve(undefined);
    if (cmd === 'get_migration_state') return Promise.resolve(false);
    if (cmd === 'complete_migration') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES_COPY)));
    return Promise.resolve(undefined);
  });
  (globalThis as Record<string, unknown>).__invokeSpyRef__ = spy;
  return { invoke: spy, convertFileSrc: (path: string) => `asset://test/${path}` };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockImplementation((event: string, handler: (p: unknown) => void) => {
    const entry: ListenerEntry = { event, handler };
    registeredListeners.push(entry);
    return Promise.resolve(() => {
      registeredListeners = registeredListeners.filter((l) => l !== entry);
    });
  }),
}));

function fireEvent(eventSuffix: string, payload: unknown) {
  registeredListeners
    .filter((l) => l.event.endsWith(eventSuffix))
    .forEach((l) => l.handler({ payload }));
}

function emitFallback(event: ProviderFallbackEvent) {
  fireEvent('-fallback:uuid-from-mock-789', event);
}

function getInvoke(): ReturnType<typeof vi.fn> {
  return (globalThis as Record<string, unknown>).__invokeSpyRef__ as ReturnType<typeof vi.fn>;
}

function expectPickerSelection(label: string, visibleName: string) {
  expect(screen.getByRole('button', { name: label }).textContent).toContain(visibleName);
}

async function openPicker(label: string) {
  const trigger = await screen.findByRole('button', { name: label }) as HTMLButtonElement;
  await waitFor(() => expect(trigger.disabled).toBe(false));
  await userEvent.setup().click(trigger);
  return screen.getByRole('listbox', { name: `${label}选项` });
}

async function choosePickerOption(label: string, optionName: RegExp) {
  const listbox = await openPicker(label);
  await userEvent.setup().click(within(listbox).getByRole('option', { name: optionName }));
}

beforeEach(() => {
  registeredListeners = [];
  (globalThis as Record<string, unknown>).__mockInvokeImpl__ = null;
  const spy = (globalThis as Record<string, unknown>).__invokeSpyRef__ as ReturnType<typeof vi.fn> | undefined;
  if (spy) spy.mockClear();
  // ProfileManagement tests verify the existing ProfileManager/editor contracts
  // through the legacy SettingsWorkspace. The cipher settings rework will add
  // equivalent coverage as each page is fully ported.
  vi.stubEnv('VITE_SETTINGS_IMPLEMENTATION', 'legacy');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function startTask() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('视频链接'), 'https://v.douyin.com/abc/');
  // Wait for credential checks to resolve so button is enabled
  await waitFor(() => {
    expect((screen.getByText('开始提炼') as HTMLButtonElement).disabled).toBe(false);
  });
  await user.click(screen.getByText('开始提炼'));
  await waitFor(() => expect(registeredListeners.length).toBe(4));
}

async function openSettings(profileType: 'transcription' | 'summary' = 'transcription') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '设置' }));
  await waitFor(() => expect(screen.getByRole('region', { name: '设置工作区' })).toBeInTheDocument());
  if (profileType === 'summary') {
    await user.click(screen.getByRole('tab', { name: 'AI 接入' }));
    await user.click(await screen.findByRole('button', { name: '预设管理' }));
  } else {
    await user.click(screen.getByRole('tab', { name: '在线模式' }));
  }
}

async function openIntegratedSettings() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '设置' }));
  await waitFor(() => expect(screen.getByRole('region', { name: '设置工作区' })).toBeInTheDocument());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Profile Quick Selectors', () => {
  it('shows separate transcription and summary quick selectors on main screen', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText('转写服务')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('核心总结')).toBeInTheDocument();
  });

  it('selector values match active profile IDs from loaded profiles', async () => {
    render(<App />);
    await waitFor(() => {
      expectPickerSelection('转写服务', '腾讯云极速版');
    });
    expectPickerSelection('核心总结', 'DeepSeek');
  });

  it('changing transcription selector calls set_active_profile', async () => {
    render(<App />);
    await choosePickerOption('转写服务', /MiMo ASR/);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith(
        'set_active_profile',
        expect.objectContaining({ profileType: 'transcription', profileId: 'mimo-asr' }),
      );
    });
  });

  it('changing summary selector calls set_active_profile with summary type', async () => {
    render(<App />);
    await choosePickerOption('核心总结', /MiMo Summary/);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith(
        'set_active_profile',
        expect.objectContaining({ profileType: 'summary', profileId: 'mimo-summary' }),
      );
    });
  });

  it('summary selector options show profile name and model', async () => {
    render(<App />);
    const listbox = await openPicker('核心总结');
    expect(within(listbox).getByRole('option', { name: /DeepSeek.*deepseek-chat/ })).toBeInTheDocument();
  });

  it('locks service selection during a running task and shows the captured services', async () => {
    render(<App />);
    await startTask();
    expect(screen.queryByRole('button', { name: '转写服务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '核心总结' })).not.toBeInTheDocument();
    const taskContext = screen.getByRole('complementary', { name: '任务运行信息' });
    expect(taskContext).toHaveTextContent('腾讯云极速版');
    expect(taskContext).toHaveTextContent('DeepSeek');
  });

  it('shows only enabled credential-ready profiles in selectors, never all enabled', async () => {
    render(<App />);
    const listbox = await openPicker('转写服务');
    expect(within(listbox).queryByRole('option', { name: /自定义 ASR/ })).not.toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /腾讯云极速版/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /MiMo ASR/ })).toBeInTheDocument();
  });

  it('shows 无可用配置 when no credential-ready transcription profiles exist', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      return Promise.resolve(undefined);
    };

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '转写服务' }).textContent).toContain('无可用配置');
    });
  });
});

describe('Integrated Settings Workspace', () => {
  it('opens Settings as a workspace with the five approved categories', async () => {
    render(<App />);
    await openIntegratedSettings();

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '语音转文字设置' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI 接入' })).toBeInTheDocument();
  });

  it('keeps Whisper model management inside the GPU transcription mode', async () => {
    render(<App />);
    await openIntegratedSettings();

    await userEvent.setup().click(screen.getByRole('tab', { name: 'GPU 模式' }));
    expect(screen.getByLabelText('本地模型管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: '设置工作区' })).toBeInTheDocument();
  });
});

describe('Fallback Notice', () => {
  it('shows fallback notice on provider-fallback event', async () => {
    render(<App />);
    await startTask();

    emitFallback({ fromProfileId: 'tencent-flash', fromProfileName: '腾讯云极速版', toProfileId: 'mimo-asr', toProfileName: 'MiMo ASR', reason: 'quota_exhausted' });

    await waitFor(() => {
      expect(screen.getByText((c: string) => c.includes('本次任务已自动切换到'))).toBeInTheDocument();
    });
  });

  it('fallback notice contains 知道了 and 打开设置 buttons', async () => {
    render(<App />);
    await startTask();

    emitFallback({ fromProfileId: 'tencent-flash', fromProfileName: '腾讯云极速版', toProfileId: 'mimo-asr', toProfileName: 'MiMo ASR', reason: 'quota_exhausted' });

    await waitFor(() => {
      expect(screen.getByText('知道了')).toBeInTheDocument();
      expect(screen.getByText('打开设置')).toBeInTheDocument();
    });
  });

  it('dismisses fallback notice when 知道了 is clicked', async () => {
    render(<App />);
    await startTask();

    emitFallback({ fromProfileId: 'tencent-flash', fromProfileName: '腾讯云极速版', toProfileId: 'mimo-asr', toProfileName: 'MiMo ASR', reason: 'quota_exhausted' });

    await waitFor(() => expect(screen.getByText('知道了')).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText('知道了'));

    await waitFor(() => {
      expect(screen.queryByText((c: string) => c.includes('本次任务已自动切换到'))).not.toBeInTheDocument();
    });
  });

  it('opens settings from fallback notice', async () => {
    render(<App />);
    await startTask();

    emitFallback({ fromProfileId: 'tencent-flash', fromProfileName: '腾讯云极速版', toProfileId: 'mimo-asr', toProfileName: 'MiMo ASR', reason: 'quota_exhausted' });

    await waitFor(() => expect(screen.getByText('打开设置')).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText('打开设置'));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '设置工作区' })).toBeInTheDocument();
    });
  });

  it('fallback notice does not interrupt task — progress still visible', async () => {
    render(<App />);
    await startTask();

    fireEvent('-progress:uuid-from-mock-789', {
      stage: 'transcribing',
      message: '转写进行中...',
      percent: 52,
    });

    emitFallback({ fromProfileId: 'tencent-flash', fromProfileName: '腾讯云极速版', toProfileId: 'mimo-asr', toProfileName: 'MiMo ASR', reason: 'quota_exhausted' });

    await waitFor(() => {
      expect(screen.getByText('转写进行中...')).toBeInTheDocument();
    });
  });

  it('task completion dismisses fallback and shows result', async () => {
    render(<App />);
    await startTask();

    emitFallback({ fromProfileId: 'tencent-flash', fromProfileName: '腾讯云极速版', toProfileId: 'mimo-asr', toProfileName: 'MiMo ASR', reason: 'quota_exhausted' });

    await waitFor(() => {
      expect(screen.getByText((c: string) => c.includes('本次任务已自动切换到'))).toBeInTheDocument();
    });

    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: '核心结论' })).toBeInTheDocument();
    });
    expect(screen.queryByText((c: string) => c.includes('本次任务已自动切换到'))).not.toBeInTheDocument();
  });

  it('reloads profiles on task completion for active selector refresh', async () => {
    render(<App />);
    await startTask();

    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);

    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('get_profiles');
    });
  });
});

describe('Settings Workspace — Service Groups and Cards', () => {
  it('opens settings workspace from settings button', async () => {
    render(<App />);
    await openSettings();
  });

  it('shows transcription profiles in the workspace', async () => {
    render(<App />);
    await openSettings();
    await waitFor(() => {
      const cards = screen.getAllByText('腾讯云极速版');
      expect(cards.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows summary profiles in a separate service group', async () => {
    render(<App />);
    await openSettings('summary');

    const summaryRegion = screen.getByRole('region', { name: '总结服务' });
    expect(summaryRegion).toBeInTheDocument();

    await waitFor(() => {
      expect(within(summaryRegion).getByText('DeepSeek')).toBeInTheDocument();
    });
  });

  it('editor opens when clicking edit on a profile', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('编辑')[0]);
    await waitFor(() => {
      const workspace = screen.getByRole('region', { name: '设置工作区' });
      const nameInput = workspace.querySelector('#editor-name') as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('腾讯云极速版');
    });
  });

  it('shows Tencent fields for Tencent profile editing', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('编辑')[0]);
    await waitFor(() => {
      expect(screen.getByLabelText('AppID')).toBeInTheDocument();
      expect(screen.getByLabelText('SecretID')).toBeInTheDocument();
      expect(screen.getByLabelText('SecretKey')).toBeInTheDocument();
    });
  });

  it('editor shows API Key for Bearer profiles', async () => {
    render(<App />);
    await openSettings();

    const mimoCard = Array.from(document.querySelectorAll('.profile-card')).find(
      (c) => c.textContent?.includes('MiMo ASR'),
    );
    if (mimoCard) {
      const editBtn = mimoCard.querySelector('.edit-btn') as HTMLElement;
      await userEvent.setup().click(editBtn);
      await waitFor(() => {
        expect(screen.getByLabelText('API Key')).toBeInTheDocument();
      });
    }
  });

  it('secret fields start empty and never echo stored values', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('编辑')[0]);
    await waitFor(() => {
      const secretIdInput = screen.getByLabelText('SecretID') as HTMLInputElement;
      const secretKeyInput = screen.getByLabelText('SecretKey') as HTMLInputElement;
      expect(secretIdInput.value).toBe('');
      expect(secretKeyInput.value).toBe('');
    });
  });

  it('supports creating custom API profiles', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(await screen.findByRole('button', { name: '新增转写服务' }));
    await choosePickerOption('服务商', /自定义兼容/);
    await waitFor(() => {
      expect(screen.getByLabelText('名称')).toBeInTheDocument();
      expect(screen.getByLabelText('API 基础地址')).toBeInTheDocument();
      expect(screen.getByLabelText('模型')).toBeInTheDocument();
    });
  });

  it('creates a custom transcription service through the approved provider dropdown', async () => {
    render(<App />);
    await openSettings();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '新增转写服务' }));
    await user.click(screen.getByRole('button', { name: '服务商' }));
    await user.click(within(screen.getByRole('listbox', { name: '服务商选项' })).getByRole('option', { name: /自定义兼容/ }));
    await user.clear(screen.getByLabelText('服务名称'));
    await user.type(screen.getByLabelText('服务名称'), '测试自定义转写');
    await user.type(screen.getByLabelText('接口地址'), 'https://example.test/v1');
    await user.type(screen.getByLabelText('模型名称'), 'whisper-test');
    await user.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(getInvoke()).toHaveBeenCalledWith('save_transcription_profile', expect.objectContaining({
      profile: expect.objectContaining({ name: '测试自定义转写', provider: 'open_ai_compatible', baseUrl: 'https://example.test/v1', model: 'whisper-test' }),
    })));
  });

  it('exposes an independent custom AI service workflow', async () => {
    render(<App />);
    await openSettings('summary');
    expect(await screen.findByRole('button', { name: '新增 AI 服务' })).not.toBeDisabled();
  });

  it('profile cards show credential status', async () => {
    render(<App />);
    await openSettings();

    await waitFor(() => {
      const elements = screen.getAllByText('凭据已配置');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('profile cards show 凭据未配置 for profiles without credentials', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') {
        const args = _args!;
        const key = `${args.profileType as string}:${args.profileId as string}`;
        return Promise.resolve(key !== 'summary:no-cred-summary' && key !== 'transcription:no-cred-asr');
      }
      return Promise.resolve(undefined);
    };

    render(<App />);
    await openSettings('summary');

    expect(screen.getByRole('region', { name: '总结服务' })).toBeInTheDocument();

    await waitFor(() => {
      const elements = screen.getAllByText('凭据未配置');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Connection Test with Charge Warning', () => {
  it('shows test button on profile cards', async () => {
    render(<App />);
    await openSettings();
    expect(screen.getAllByText('测试').length).toBeGreaterThanOrEqual(1);
  });

  it('shows charge warning on first click, then runs test on second click', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('测试')[0]);
    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('确认测试（可能产生少量费用）'))).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByText((c) => c.includes('确认测试（可能产生少量费用）')));

    await waitFor(() => {
      expect(screen.getByText('测试成功')).toBeInTheDocument();
    });
  });

  it('shows test result after clicking test', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('测试')[0]);
    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('确认测试'))).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByText((c) => c.includes('确认测试')));
    await waitFor(() => {
      expect(screen.getByText('测试成功')).toBeInTheDocument();
    });
  });
});

describe('Fallback Selector', () => {
  it('limits fallback options to credential-ready, enabled, non-Tencent, non-active profiles', async () => {
    render(<App />);
    await openSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /备用转写配置/ })).toBeInTheDocument();
    });
    await userEvent.setup().click(screen.getByRole('button', { name: /备用转写配置/ }));
    const listbox = screen.getByRole('listbox', { name: /备用转写配置.*选项/ });
    expect(within(listbox).queryByRole('option', { name: /腾讯云极速版/ })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /自定义 ASR/ })).not.toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /MiMo ASR/ })).toBeInTheDocument();
  });

  it('shows missing-fallback warning on active transcription card without fallback', async () => {
    render(<App />);
    await openSettings();

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('未配置备用配置档'))).toBeInTheDocument();
    });
  });
});

describe('Model Discovery — Explicit Only', () => {
  it('does NOT auto-discover on opening an editor for a summary profile', async () => {
    render(<App />);
    await openSettings('summary');

    expect(screen.getByRole('region', { name: '总结服务' })).toBeInTheDocument();

    const deepseekCard = Array.from(document.querySelectorAll('.profile-card')).find(
      (c) => c.textContent?.includes('DeepSeek'),
    );
    expect(deepseekCard).toBeDefined();
    if (deepseekCard) {
      const editBtn = deepseekCard.querySelector('.edit-btn') as HTMLElement;
      await userEvent.setup().click(editBtn);
    }

    await new Promise((r) => setTimeout(r, 50));
    expect(getInvoke()).not.toHaveBeenCalledWith('discover_summary_models', expect.anything());
  });

  it('discovers models only on explicit 发现模型 click', async () => {
    render(<App />);
    await openSettings('summary');

    expect(screen.getByRole('region', { name: '总结服务' })).toBeInTheDocument();

    const deepseekCard = Array.from(document.querySelectorAll('.profile-card')).find(
      (c) => c.textContent?.includes('DeepSeek'),
    );
    expect(deepseekCard).toBeDefined();
    if (deepseekCard) {
      const editBtn = deepseekCard.querySelector('.edit-btn') as HTMLElement;
      await userEvent.setup().click(editBtn);
    }

    await waitFor(() => expect(screen.getByText('发现模型')).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText('发现模型'));

    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('discover_summary_models', expect.anything());
    });
  });

  it('preserves manual model input after discovery failure', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') return Promise.resolve(true);
      if (cmd === 'discover_summary_models') return Promise.reject(new Error('发现失败'));
      if (cmd === 'test_profile') return Promise.resolve({ success: true, message: '测试成功', latencyMs: null });
      if (cmd === 'set_active_profile') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'set_fallback_transcription_profile') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      return Promise.resolve(undefined);
    };

    render(<App />);
    await openSettings('summary');

    expect(screen.getByRole('region', { name: '总结服务' })).toBeInTheDocument();

    const deepseekCard = Array.from(document.querySelectorAll('.profile-card')).find(
      (c) => c.textContent?.includes('DeepSeek'),
    );
    expect(deepseekCard).toBeDefined();
    if (deepseekCard) {
      const editBtn = deepseekCard.querySelector('.edit-btn') as HTMLElement;
      await userEvent.setup().click(editBtn);
    }

    await waitFor(() => expect(screen.getByText('发现模型')).toBeInTheDocument());

    const modelInput = screen.getByRole('textbox', { name: '模型' }) as HTMLInputElement;
    await userEvent.setup().clear(modelInput);
    await userEvent.setup().type(modelInput, 'my-custom-model');

    await userEvent.setup().click(screen.getByText('发现模型'));

    await waitFor(() => {
      expect(screen.getByText('发现失败')).toBeInTheDocument();
    });

    expect((screen.getByRole('textbox', { name: '模型' }) as HTMLInputElement).value).toBe('my-custom-model');
  });
});

describe('Delete Confirmation and Active-Delete Protection', () => {
  it('requires two-step confirmation for delete', async () => {
    render(<App />);
    await openSettings();

    const mimoDeleteBtn = Array.from(document.querySelectorAll('.profile-card'))
      .find((c) => c.textContent?.includes('MiMo ASR'))
      ?.querySelector('.delete-btn') as HTMLElement;
    expect(mimoDeleteBtn).toBeDefined();

    await userEvent.setup().click(mimoDeleteBtn);
    expect(mimoDeleteBtn.textContent).toBe('确认删除');
  });

  it('prevents delete of active transcription profile with warning', async () => {
    render(<App />);
    await openSettings();

    const activeDeleteBtn = Array.from(document.querySelectorAll('.profile-card'))
      .find((c) => c.textContent?.includes('腾讯云极速版') && c.textContent?.includes('当前'))
      ?.querySelector('.delete-btn') as HTMLElement;
    expect(activeDeleteBtn).toBeDefined();

    await userEvent.setup().click(activeDeleteBtn);

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('此配置档为当前使用的转写配置档'))).toBeInTheDocument();
    });
  });
});

describe('Blank-Secret Edit Preserves Stored Credential', () => {
  it('saving a Tencent profile with blank secrets sends no credential payload', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('编辑')[0]);
    await waitFor(() => {
      expect(screen.getByLabelText('AppID')).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByText('保存'));

    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith(
        'save_transcription_profile',
        expect.objectContaining({ credential: null }),
      );
    });
  });

  it('partial Tencent credentials block save', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('编辑')[0]);
    await waitFor(() => {
      expect(screen.getByLabelText('AppID')).toBeInTheDocument();
    });

    await userEvent.setup().type(screen.getByLabelText('AppID'), 'my-app-id');
    await userEvent.setup().click(screen.getByText('保存'));

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('请填写完整的腾讯云凭据'))).toBeInTheDocument();
    });

    expect(getInvoke()).not.toHaveBeenCalledWith(
      'save_transcription_profile',
      expect.anything(),
    );
  });
});

describe('Legacy API Key Gate Removed', () => {
  it('start button readiness uses profile credential status, not legacy checkApiKey', async () => {
    render(<App />);

    expect(getInvoke()).not.toHaveBeenCalledWith('check_api_key');
  });

  it('shows specific credential warning for missing transcription credential', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') {
        const args = _args!;
        const key = `${args.profileType as string}:${args.profileId as string}`;
        return Promise.resolve(key === 'summary:deepseek-main');
      }
      return Promise.resolve(undefined);
    };

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('请先配置转写凭据'))).toBeInTheDocument();
    });
  });
});

// ── Minimal Fix 02 ────────────────────────────────────────────────────────────

describe('Persisted Switch Updates Controlled Values', () => {
  it('returns changed profiles after set_active_profile and asserts selector update', async () => {
    // Track mutable profiles state: start with default, update on set_active_profile
    let currentProfiles = JSON.parse(JSON.stringify(MOCK_PROFILES));
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(currentProfiles)));
      if (cmd === 'has_profile_credential') return Promise.resolve(true);
      if (cmd === 'set_active_profile') {
        currentProfiles = JSON.parse(JSON.stringify(currentProfiles));
        if (_args?.profileType === 'transcription') currentProfiles.activeTranscriptionProfileId = _args?.profileId;
        else currentProfiles.activeSummaryProfileId = _args?.profileId;
        return Promise.resolve(JSON.parse(JSON.stringify(currentProfiles)));
      }
      if (cmd === 'set_fallback_transcription_profile') return Promise.resolve(JSON.parse(JSON.stringify(currentProfiles)));
      if (cmd === 'save_transcription_profile' || cmd === 'save_summary_profile' || cmd === 'delete_profile') return Promise.resolve(JSON.parse(JSON.stringify(currentProfiles)));
      return Promise.resolve(undefined);
    };

    render(<App />);
    await waitFor(() => {
      expectPickerSelection('转写服务', '腾讯云极速版');
    });

    // Switch transcription to mimo-asr
    await choosePickerOption('转写服务', /MiMo ASR/);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('set_active_profile', expect.objectContaining({ profileType: 'transcription', profileId: 'mimo-asr' }));
    });

    // Wait for onProfileChanged → reloadProfiles → get_profiles → rerender with new active
    await waitFor(() => {
      expectPickerSelection('转写服务', 'MiMo ASR');
    });

    // Persist and reload the summary selector as well.
    await choosePickerOption('核心总结', /MiMo Summary/);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith(
        'set_active_profile',
        expect.objectContaining({ profileType: 'summary', profileId: 'mimo-summary' }),
      );
    });
    await waitFor(() => {
      expectPickerSelection('核心总结', 'MiMo Summary');
    });
  });
});

describe('Active Unready Selector Coherence', () => {
  it('shows placeholder when active profile is not credential-ready but other ready options exist', async () => {
    // tencent-flash is active but not credential-ready; mimo-asr IS ready
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') {
        const args = _args!;
        const key = `${args.profileType as string}:${args.profileId as string}`;
        return Promise.resolve(key === 'transcription:mimo-asr' || key === 'summary:deepseek-main' || key === 'summary:mimo-summary');
      }
      return Promise.resolve(undefined);
    };

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '转写服务' }).textContent).toContain('请选择可用配置');
    });

    // mimo-asr is ready and should be selectable
    await choosePickerOption('转写服务', /MiMo ASR/);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('set_active_profile', expect.objectContaining({ profileType: 'transcription', profileId: 'mimo-asr' }));
    });
  });

  it('shows a matching empty placeholder when no active ID exists but ready options do', async () => {
    const profiles: AppProfiles = {
      ...JSON.parse(JSON.stringify(MOCK_PROFILES)),
      activeTranscriptionProfileId: null,
    };
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (
      cmd: string,
    ) => {
      if (cmd === 'has_profile_credential') return Promise.resolve(true);
      if (cmd === 'set_active_profile') return Promise.resolve(profiles);
      return Promise.resolve(undefined);
    };

    render(
      <ProfileSelectors profiles={profiles} disabled={false} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '转写服务' }).textContent).toContain('请选择可用配置');
    });

    await choosePickerOption('转写服务', /MiMo ASR/);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('set_active_profile', {
        profileType: 'transcription',
        profileId: 'mimo-asr',
      });
    });
  });

  it('ignores a delayed readiness rejection from the previous profile document', async () => {
    let rejectOld!: (reason?: unknown) => void;
    const oldReadiness = new Promise<boolean>((_resolve, reject) => {
      rejectOld = reject;
    });
    const oldProfiles: AppProfiles = {
      schemaVersion: 1,
      activeTranscriptionProfileId: 'old-asr',
      activeSummaryProfileId: null,
      fallbackTranscriptionProfileId: null,
      transcriptionProfiles: [
        {
          id: 'old-asr', name: '旧配置', provider: 'mimo_asr',
          baseUrl: 'https://old.example.com', model: 'old-model', enabled: true, builtIn: false,
        },
      ],
      summaryProfiles: [],
    };
    const newProfiles: AppProfiles = {
      ...oldProfiles,
      activeTranscriptionProfileId: 'new-asr',
      transcriptionProfiles: [
        oldProfiles.transcriptionProfiles[0],
        {
          id: 'new-asr', name: '新配置', provider: 'mimo_asr',
          baseUrl: 'https://new.example.com', model: 'new-model', enabled: true, builtIn: false,
        },
      ],
    };
    let oldProfileQueryCount = 0;
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (
      cmd: string,
      args?: Record<string, unknown>,
    ) => {
      if (cmd === 'has_profile_credential' && args?.profileId === 'old-asr') {
        oldProfileQueryCount += 1;
        return oldProfileQueryCount === 1 ? oldReadiness : Promise.resolve(true);
      }
      if (cmd === 'has_profile_credential') return Promise.resolve(true);
      return Promise.resolve(undefined);
    };

    const { rerender } = render(
      <ProfileSelectors profiles={oldProfiles} disabled={false} />,
    );
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('has_profile_credential', {
        profileType: 'transcription',
        profileId: 'old-asr',
      });
    });

    rerender(<ProfileSelectors profiles={newProfiles} disabled={false} />);
    await waitFor(() => {
      expectPickerSelection('转写服务', '新配置');
    });

    await act(async () => {
      rejectOld(new Error('旧配置查询失败'));
      await Promise.resolve();
    });
    expect(screen.queryByText('旧配置查询失败')).not.toBeInTheDocument();
    expectPickerSelection('转写服务', '新配置');
  });
});

describe('Selector Failure Messages', () => {
  it('surfaces set_active_profile failure in mutation error', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') return Promise.resolve(true);
      if (cmd === 'set_active_profile') return Promise.reject(new Error('切换配置失败: 后端错误'));
      return Promise.resolve(undefined);
    };

    render(<App />);
    await choosePickerOption('转写服务', /MiMo ASR/);
    await waitFor(() => {
      expect(screen.getByText('切换配置失败: 后端错误')).toBeInTheDocument();
    });
  });

  it('surfaces readiness query failure as accessible error', async () => {
    // has_profile_credential rejects for all profiles
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') return Promise.resolve(JSON.parse(JSON.stringify(MOCK_PROFILES)));
      if (cmd === 'has_profile_credential') return Promise.reject(new Error('凭据服务不可用'));
      return Promise.resolve(undefined);
    };

    render(<App />);
    await waitFor(() => {
      const errors = screen.getAllByText('凭据服务不可用');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Fallback Completion Persists Active Selector', () => {
  it('after task completion, returns to idle with MiMo as active transcription', async () => {
    // Track mutable state: initial = tencent-flash active; after set_active_profile + completion = mimo-asr active
    let currentProfiles = JSON.parse(JSON.stringify(MOCK_PROFILES));
    let completed = false;
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_profiles') {
        // After completion, return profiles with mimo-asr active
        return Promise.resolve(JSON.parse(JSON.stringify(currentProfiles)));
      }
      if (cmd === 'has_profile_credential') return Promise.resolve(true);
      if (cmd === 'set_active_profile') {
        currentProfiles = JSON.parse(JSON.stringify(currentProfiles));
        if (_args?.profileType === 'transcription') currentProfiles.activeTranscriptionProfileId = _args?.profileId;
        else currentProfiles.activeSummaryProfileId = _args?.profileId;
        return Promise.resolve(JSON.parse(JSON.stringify(currentProfiles)));
      }
      if (cmd === 'start_distillation') {
        // Simulate the backend completing; after completion, profiles change
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    };

    render(<App />);
    await startTask();

    // Emit completion — handler reloads profiles
    // Before completion, switch the persisted state so get_profiles returns mimo-asr active
    currentProfiles.activeTranscriptionProfileId = 'mimo-asr';
    fireEvent('-complete:uuid-from-mock-789', MOCK_RESULT);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: '核心结论' })).toBeInTheDocument();
    });

    // Click 提炼新视频 to return to idle
    await userEvent.setup().click(screen.getByText('提炼新视频'));

    await waitFor(() => {
      expect(screen.getByLabelText('转写服务')).toBeInTheDocument();
    });

    // The transcription selector should now show mimo-asr as the active value
    expectPickerSelection('转写服务', 'MiMo ASR');
    expectPickerSelection('核心总结', 'DeepSeek');
  });
});

describe('Delete Confirmation Calls delete_profile', () => {
  it('first click does not invoke delete_profile, second click invokes with exact type and id', async () => {
    render(<App />);
    await openSettings();

    const mimoCard = Array.from(document.querySelectorAll('.profile-card'))
      .find((c) => c.textContent?.includes('MiMo ASR'));

    expect(mimoCard).toBeDefined();
    const deleteBtn = mimoCard!.querySelector('.delete-btn') as HTMLElement;
    expect(deleteBtn).toBeDefined();

    // First click: label changes but delete_profile NOT called
    await userEvent.setup().click(deleteBtn);
    expect(deleteBtn.textContent).toBe('确认删除');
    expect(getInvoke()).not.toHaveBeenCalledWith('delete_profile', expect.anything());

    // Second click: actually invokes delete_profile
    await userEvent.setup().click(deleteBtn);
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('delete_profile', { profileType: 'transcription', profileId: 'mimo-asr' });
    });
  });

  it('preserves active-delete protection', async () => {
    render(<App />);
    await openSettings();

    const activeDeleteBtn = Array.from(document.querySelectorAll('.profile-card'))
      .find((c) => c.textContent?.includes('腾讯云极速版') && c.textContent?.includes('当前'))
      ?.querySelector('.delete-btn') as HTMLElement;
    expect(activeDeleteBtn).toBeDefined();

    await userEvent.setup().click(activeDeleteBtn);

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('此配置档为当前使用的转写配置档'))).toBeInTheDocument();
    });
    expect(getInvoke()).not.toHaveBeenCalledWith('delete_profile', expect.anything());
  });
});

describe('Valid Tencent Credential Replacement', () => {
  it('fills AppID, SecretID, SecretKey and asserts exact camelCase credential payload', async () => {
    render(<App />);
    await openSettings();

    await userEvent.setup().click(screen.getAllByText('编辑')[0]);
    await waitFor(() => {
      expect(screen.getByLabelText('AppID')).toBeInTheDocument();
    });

    // Fill all three fields
    await userEvent.setup().type(screen.getByLabelText('AppID'), 'my-app-id');
    await userEvent.setup().type(screen.getByLabelText('SecretID'), 'my-secret-id');
    await userEvent.setup().type(screen.getByLabelText('SecretKey'), 'my-secret-key');

    await userEvent.setup().click(screen.getByText('保存'));

    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('save_transcription_profile', expect.objectContaining({
        credential: {
          type: 'tencent',
          appId: 'my-app-id',
          secretId: 'my-secret-id',
          secretKey: 'my-secret-key',
        },
      }));
    });
  });
});

// ── Migration Notice UI Tests (Stage 05 Minimal Fix 01) ────────────────────

describe('Migration Notice UI', () => {
  beforeEach(() => {
    // Reset to default: get_migration_state returns true by default for this describe block
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = null;
  });

  it('shows migration notice when get_migration_state returns true', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_migration_state') return Promise.resolve(true);
      if (cmd === 'get_profiles') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: true, transcriptionProfiles: [], summaryProfiles: [] });
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      return Promise.resolve(undefined);
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('检测到旧版凭据')).toBeInTheDocument();
    });
  });

  it('migration notice has open settings action', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_migration_state') return Promise.resolve(true);
      if (cmd === 'get_profiles') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: true, transcriptionProfiles: [], summaryProfiles: [] });
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      return Promise.resolve(undefined);
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('打开设置')).toBeInTheDocument();
    });
  });

  it('dismissal alone does not invoke completeMigration', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_migration_state') return Promise.resolve(true);
      if (cmd === 'get_profiles') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: true, transcriptionProfiles: [], summaryProfiles: [] });
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      return Promise.resolve(undefined);
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('稍后提醒')).toBeInTheDocument();
    });
    await userEvent.setup().click(screen.getByText('稍后提醒'));
    await waitFor(() => {
      expect(screen.queryByText('检测到旧版凭据')).not.toBeInTheDocument();
    });
    // completeMigration must NOT have been called
    expect(getInvoke()).not.toHaveBeenCalledWith('complete_migration', expect.anything());
  });

  it('completion calls completeMigration with confirmed: true', async () => {
    let completed = false;
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_migration_state') return Promise.resolve(true);
      if (cmd === 'get_profiles') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: true, transcriptionProfiles: [], summaryProfiles: [] });
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      if (cmd === 'complete_migration') {
        completed = true;
        return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] });
      }
      return Promise.resolve(undefined);
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('我已配置好，确认迁移')).toBeInTheDocument();
    });
    await userEvent.setup().click(screen.getByText('我已配置好，确认迁移'));
    await waitFor(() => {
      expect(getInvoke()).toHaveBeenCalledWith('complete_migration', { confirmed: true });
    });
    expect(completed).toBe(true);
  });

  it('failed migration stays visible with error message', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_migration_state') return Promise.resolve(true);
      if (cmd === 'get_profiles') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: true, transcriptionProfiles: [], summaryProfiles: [] });
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      if (cmd === 'complete_migration') return Promise.reject(new Error('凭据配置不完整'));
      return Promise.resolve(undefined);
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('检测到旧版凭据')).toBeInTheDocument();
    });
    await userEvent.setup().click(screen.getByText('我已配置好，确认迁移'));
    await waitFor(() => {
      expect(screen.getByText((c: string) => c.includes('凭据配置不完整'))).toBeInTheDocument();
    });
    // Notice still visible
    expect(screen.getByText('检测到旧版凭据')).toBeInTheDocument();
  });

  it('successful completion removes notice and refreshes profiles', async () => {
    (globalThis as Record<string, unknown>).__mockInvokeImpl__ = (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === 'get_migration_state') return Promise.resolve(true);
      if (cmd === 'get_profiles') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: true, transcriptionProfiles: [], summaryProfiles: [] });
      if (cmd === 'has_profile_credential') return Promise.resolve(false);
      if (cmd === 'complete_migration') return Promise.resolve({ schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] });
      return Promise.resolve(undefined);
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('检测到旧版凭据')).toBeInTheDocument();
    });
    await userEvent.setup().click(screen.getByText('我已配置好，确认迁移'));
    await waitFor(() => {
      expect(screen.queryByText('检测到旧版凭据')).not.toBeInTheDocument();
    });
    // Profiles were refreshed
    expect(getInvoke()).toHaveBeenCalledWith('get_profiles');
  });
});
