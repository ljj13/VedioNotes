/** workbench-ui.test 测试 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';

const bridge = vi.hoisted(() => ({
  getProfiles: vi.fn(), hasProfileCredential: vi.fn(), getMigrationState: vi.fn(),
  invokeStartDistillation: vi.fn(), cancelDistillation: vi.fn(),
  onTaskProgress: vi.fn(), onTaskComplete: vi.fn(), onTaskError: vi.fn(), onProviderFallback: vi.fn(),
  listHistory: vi.fn(), searchHistory: vi.fn(), getHistory: vi.fn(), getHistoryMarkdown: vi.fn(), deleteHistory: vi.fn(),
  searchLibrary: vi.fn(), markNoteOpened: vi.fn(), setNoteFavorite: vi.fn(), setNoteTags: vi.fn(),
  listTaskRecords: vi.fn(), retryTaskRecord: vi.fn(), setActiveProfile: vi.fn(), getDiagnosticLogPath: vi.fn(),
  askHistoryNote: vi.fn(),
  listLocalModels: vi.fn(),
  getPreferences: vi.fn(), getSenseVoiceStatus: vi.fn(),
  getCapabilityStatus: vi.fn(),
}));

vi.mock('../src/lib/bridge', () => bridge);
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://history/${path}` }));
vi.mock('../src/lib/localMedia', () => ({ openLocalMedia: vi.fn(), subscribeToMediaDrop: vi.fn().mockResolvedValue(() => {}) }));

const profiles = {
  schemaVersion: 1, activeTranscriptionProfileId: 'transcribe', activeSummaryProfileId: 'summary',
  fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [],
};
const entry = {
  id: 7, title: 'Linear algebra lecture', source: 'https://video.example/watch', noteTemplate: 'core_distillation',
  noteStyle: 'minimal',
  createdAt: '2026-07-13T10:00:00Z', markdownPath: 'C:/note.md', transcriptPath: 'C:/transcript.txt',
  thumbnailPath: null, screenshotPaths: [],
};

async function openHistoryWorkspace(user: ReturnType<typeof userEvent.setup>) {
  const navigation = screen.getByRole('navigation', { name: '主导航' });
  await user.click(navigation.querySelector('button[aria-label="笔记库"]') as HTMLElement);
  await screen.findByLabelText('搜索笔记');
}

// describe('workbench UI', () => {
describe('workbench UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getProfiles.mockResolvedValue(profiles);
    bridge.listLocalModels.mockResolvedValue([]);
    bridge.getPreferences.mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto' });
    bridge.getSenseVoiceStatus.mockResolvedValue(null);
    bridge.getCapabilityStatus.mockResolvedValue({
      vector: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      rerank: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      webSearch: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      tts: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      image: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      localAgent: { enabled: false, configured: false, credentialReady: false, providerId: '' },
    });
    bridge.hasProfileCredential.mockResolvedValue(true);
    bridge.getMigrationState.mockResolvedValue(false);
    bridge.listHistory.mockResolvedValue([entry]);
    bridge.searchHistory.mockResolvedValue([entry]);
    bridge.getHistory.mockResolvedValue(entry);
    const libraryEntry = { ...entry, favorite: false, tags: [], lastOpenedAt: null };
    bridge.searchLibrary.mockResolvedValue({ entries: [libraryEntry], tags: [], total: 1 });
    bridge.markNoteOpened.mockResolvedValue(libraryEntry);
    bridge.setNoteFavorite.mockResolvedValue({ ...libraryEntry, favorite: true });
    bridge.setNoteTags.mockResolvedValue(libraryEntry);
    bridge.listTaskRecords.mockResolvedValue([]);
    bridge.setActiveProfile.mockResolvedValue(profiles);
    bridge.getDiagnosticLogPath.mockResolvedValue('diagnostics.jsonl');
    bridge.getHistoryMarkdown.mockResolvedValue('# Stored note\nFull saved Markdown');
    bridge.onTaskProgress.mockResolvedValue(() => {});
    bridge.onTaskComplete.mockResolvedValue(() => {});
    bridge.onTaskError.mockResolvedValue(() => {});
    bridge.onProviderFallback.mockResolvedValue(() => {});
    bridge.cancelDistillation.mockResolvedValue(undefined);
  });

  // it('starts a platform-neutral URL task with core-distillatio
  it('starts a platform-neutral URL task with core-distillation and screenshots disabled', async () => {
    render(<App />);
    const user = userEvent.setup();
    await screen.findByLabelText('视频链接');
    await user.type(screen.getByLabelText('视频链接'), 'https://www.youtube.com/watch?v=abc');
    await user.click(screen.getByRole('button', { name: '开始提炼' }));
    await waitFor(() => expect(bridge.invokeStartDistillation).toHaveBeenCalled());
    expect(bridge.invokeStartDistillation.mock.calls[0][1]).toEqual({ kind: 'youtube_url', url: 'https://www.youtube.com/watch?v=abc' });
    expect(bridge.invokeStartDistillation.mock.calls[0][4]).toEqual({ note_template: 'core_distillation', note_style: 'minimal', include_screenshots: false, transcription_mode: 'online_profile', sensevoice_model: 'int8', sensevoice_languages: ['zh'] });
  });

  // it('starts a task with screenshots enabled when the accessib
  it('starts a task with screenshots enabled when the accessible key-screenshot checkbox is selected', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('视频链接'), 'https://www.youtube.com/watch?v=abc');
    await user.click(screen.getByRole('checkbox', { name: '关键截图' }));
    await user.click(screen.getByRole('button', { name: '开始提炼' }));
    await waitFor(() => expect(bridge.invokeStartDistillation).toHaveBeenCalled());
    expect(bridge.invokeStartDistillation.mock.calls[0][4]).toEqual({ note_template: 'core_distillation', note_style: 'minimal', include_screenshots: true, transcription_mode: 'online_profile', sensevoice_model: 'int8', sensevoice_languages: ['zh'] });
  });

  // it('filters history and requires a second confirmation befor
  it('filters history and requires a second confirmation before deleting a note', async () => {
    render(<App />);
    const user = userEvent.setup();
    await openHistoryWorkspace(user);
    await screen.findByText('Linear algebra lecture');
    await user.type(screen.getByLabelText('搜索笔记'), 'linear');
    await waitFor(() => expect(bridge.searchLibrary).toHaveBeenCalledWith(expect.objectContaining({ text: 'linear' })));
    await user.click(screen.getByRole('button', { name: '删除 Linear algebra lecture' }));
    expect(bridge.deleteHistory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '确认删除 Linear algebra lecture' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认删除 Linear algebra lecture' }));
    await waitFor(() => expect(bridge.deleteHistory).toHaveBeenCalledWith(7));
  });

  // it('opens a selected note drawer and sends questions only fo
  it('opens a selected note drawer and sends questions only for that history id', async () => {
    bridge.askHistoryNote.mockResolvedValue([{ role: 'user', content: '新的问题' }, { role: 'assistant', content: '答案' }]);
    render(<App />);
    const user = userEvent.setup();
    await openHistoryWorkspace(user);
    await screen.findByText('Linear algebra lecture');
    const historyRail = screen.getByRole('complementary', { name: '笔记列表' });
    await user.click(within(historyRail).getByRole('button', { name: '打开笔记 Linear algebra lecture' }));
    await user.click(await screen.findByRole('button', { name: '向笔记提问' }));
    await screen.findByRole('complementary', { name: '笔记问答' });
    await waitFor(() => expect(bridge.markNoteOpened).toHaveBeenCalledWith(7));
    expect(screen.getByRole('link', { name: '原视频' })).toHaveAttribute('href', 'https://video.example/watch');
    await user.type(screen.getByLabelText('向此笔记提问'), '新的问题');
    await user.click(screen.getByRole('button', { name: '发送问题' }));
    await waitFor(() => expect(bridge.askHistoryNote).toHaveBeenCalledWith(7, '新的问题'));
    expect(screen.getByText('答案')).toBeInTheDocument();
  });

  // it('loads and renders the selected saved Markdown again afte
  it('loads and renders the selected saved Markdown again after reopening a history note', async () => {
    render(<App />); const user = userEvent.setup();
    await openHistoryWorkspace(user);
    const note = await screen.findByText('Linear algebra lecture');
    await user.click(note);
    expect(await screen.findByText(/Full saved Markdown/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '向笔记提问' }));
    await user.click(screen.getByRole('button', { name: '关闭笔记问答' }));
    const historyRail = screen.getByRole('complementary', { name: '笔记列表' });
    await user.click(within(historyRail).getByRole('button', { name: '打开笔记 Linear algebra lecture' }));
    await screen.findByText(/Full saved Markdown/);
    expect(bridge.markNoteOpened).toHaveBeenCalledTimes(2);
  });

  // it('returns from an open history note to the create workspac
  it('returns from an open history note to the create workspace', async () => {
    render(<App />);
    const user = userEvent.setup();
    await openHistoryWorkspace(user);
    await user.click(await screen.findByText('Linear algebra lecture'));
    await user.click(await screen.findByRole('button', { name: '向笔记提问' }));
    await screen.findByRole('complementary', { name: '笔记问答' });

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    await user.click(navigation.querySelector('button[aria-label="新建提炼"]') as HTMLElement);

    expect(await screen.findByLabelText('视频链接')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '笔记问答' })).toBeNull();
  });

  // it('keeps the history rail available inside the full-window
  it('keeps the history rail available inside the full-window workbench', async () => {
    render(<App />);
    const user = userEvent.setup();
    await openHistoryWorkspace(user);
    await screen.findByLabelText('搜索笔记');
    expect(document.querySelector('.workbench-app')).toHaveClass('workbench-app');
    expect(document.querySelector('.library-browser')).toBeTruthy();
  });

  // it('ignores completion and error callbacks delivered after c
  it('ignores completion and error callbacks delivered after cancellation', async () => {
    const callbacks: Record<string, (payload: any) => void> = {};
    bridge.onTaskProgress.mockImplementation(async (_id: string, callback: any) => { callbacks.progress = callback; return vi.fn(); });
    bridge.onTaskComplete.mockImplementation(async (_id: string, callback: any) => { callbacks.complete = callback; return vi.fn(); });
    bridge.onTaskError.mockImplementation(async (_id: string, callback: any) => { callbacks.error = callback; return vi.fn(); });
    bridge.onProviderFallback.mockImplementation(async (_id: string, callback: any) => { callbacks.fallback = callback; return vi.fn(); });
    let resolveCancel!: () => void;
    bridge.cancelDistillation.mockReturnValue(new Promise<void>((resolve) => { resolveCancel = resolve; }));
    render(<App />); const user = userEvent.setup();
    await user.type(await screen.findByLabelText('视频链接'), 'https://www.youtube.com/watch?v=abc');
    await user.click(screen.getByRole('button', { name: '开始提炼' }));
    callbacks.progress({ stage: 'transcribing', message: 'working' });
    await screen.findByRole('button', { name: '取消任务' });
    fireEvent.click(screen.getByRole('button', { name: '取消任务' }));
    callbacks.complete({ distillation: { core_conclusion: 'late', key_evidence: [], implications: [] }, saved_path: 'late.md' });
    callbacks.error({ code: 'late', message: 'late error', recovery: 'no' });
    expect(screen.queryByText('late')).not.toBeInTheDocument();
    expect(screen.queryByText('late error')).not.toBeInTheDocument();
    resolveCancel();
  });

  // it('preserves a live task across harmless navigation and can
  it('preserves a live task across harmless navigation and cancels that exact task id', async () => {
    const callbacks: Record<string, (payload: any) => void> = {};
    bridge.onTaskProgress.mockImplementation(async (_id: string, callback: any) => { callbacks.progress = callback; return vi.fn(); });
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('视频链接'), 'https://www.youtube.com/watch?v=active');
    await user.click(screen.getByRole('button', { name: '开始提炼' }));
    await waitFor(() => expect(bridge.invokeStartDistillation).toHaveBeenCalledTimes(1));
    const liveTaskId = bridge.invokeStartDistillation.mock.calls[0][0];
    callbacks.progress({ stage: 'transcribing', message: '仍在转写' });
    await screen.findByRole('button', { name: '取消任务' });

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    await user.click(navigation.querySelector('button[aria-label="笔记库"]') as HTMLElement);
    await screen.findByLabelText('搜索笔记');
    await user.click(navigation.querySelector('button[aria-label="新建提炼"]') as HTMLElement);

    expect(await screen.findByText('仍在转写')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消任务' }));
    await waitFor(() => expect(bridge.cancelDistillation).toHaveBeenCalledWith(liveTaskId));
  });
});
