/**
 *测试文件——测试 LibraryWorkspace 组件/模块的行为是否符合预期。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryEntry, LibrarySnapshot } from '../lib/types';
import LibraryWorkspace from './LibraryWorkspace';

const bridge = vi.hoisted(() => ({
  searchLibrary: vi.fn(),
  getHistoryMarkdown: vi.fn(),
  markNoteOpened: vi.fn(),
  setNoteFavorite: vi.fn(),
  setNoteTags: vi.fn(),
  deleteHistory: vi.fn(),
  askHistoryNote: vi.fn(),
  getCapabilityStatus: vi.fn(),
  semanticSearch: vi.fn(),
  indexNote: vi.fn(),
  runLocalAgent: vi.fn(),
}));
vi.mock('../lib/bridge', () => bridge);

const entry: LibraryEntry = {
  id: 7,
  title: '矩阵课程笔记',
  source: 'https://www.bilibili.com/video/BV1',
  noteTemplate: 'core_distillation',
  noteStyle: 'minimal',
  createdAt: '2026-07-15T08:00:00Z',
  markdownPath: 'owned.md',
  transcriptPath: 'owned.txt',
  thumbnailPath: null,
  screenshotPaths: [],
  favorite: false,
  tags: ['数学'],
  lastOpenedAt: null,
};

const snapshot: LibrarySnapshot = {
  entries: [entry],
  tags: [{ id: 1, name: '数学', noteCount: 1 }],
  total: 1,
};

// describe('LibraryWorkspace', () => {
describe('LibraryWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.searchLibrary.mockResolvedValue(snapshot);
    bridge.getHistoryMarkdown.mockResolvedValue('## 核心结论\n\n- 第一条依据');
    bridge.markNoteOpened.mockResolvedValue({ ...entry, lastOpenedAt: '2026-07-15T09:00:00Z' });
    bridge.setNoteFavorite.mockResolvedValue({ ...entry, favorite: true });
    bridge.setNoteTags.mockResolvedValue(entry);
    bridge.deleteHistory.mockResolvedValue(undefined);
    bridge.askHistoryNote.mockResolvedValue([]);
    bridge.getCapabilityStatus.mockResolvedValue({
      vector: { enabled: true, configured: true, credentialReady: true, providerId: 'vector' },
      rerank: { enabled: true, configured: true, credentialReady: true, providerId: 'rerank' },
      webSearch: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      tts: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      image: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      localAgent: { enabled: true, configured: true, credentialReady: true, providerId: 'codex' },
    });
    bridge.semanticSearch.mockResolvedValue([{ id: '7#0', score: 0.92, text: '向量命中片段' }]);
    bridge.indexNote.mockResolvedValue(undefined);
    bridge.runLocalAgent.mockResolvedValue({ answer: '本地智能体处理完成。' });
  });

  // it('filters through the typed backend query and renders owne
  it('filters through the typed backend query and renders owned Markdown semantically', async () => {
    const user = userEvent.setup();
    render(<LibraryWorkspace />);

    await user.click(await screen.findByRole('button', { name: /打开笔记 矩阵课程笔记/ }));
    expect(await screen.findByRole('heading', { level: 2, name: '核心结论' })).toBeTruthy();
    expect(screen.getByRole('list').textContent).toContain('第一条依据');
    expect(bridge.markNoteOpened).toHaveBeenCalledWith(7);

    await user.click(screen.getByRole('button', { name: '已收藏' }));
    await waitFor(() => expect(bridge.searchLibrary).toHaveBeenCalledWith(expect.objectContaining({ favorite: true })));
  });

  // it('reserves a real note Q&A region instead of covering the
  it('reserves a real note Q&A region instead of covering the Markdown', async () => {
    const user = userEvent.setup();
    render(<LibraryWorkspace />);
    await user.click(await screen.findByRole('button', { name: /打开笔记 矩阵课程笔记/ }));
    await user.click(await screen.findByRole('button', { name: '向笔记提问' }));

    const workspace = screen.getByRole('region', { name: '笔记库工作区' });
    const chat = screen.getByRole('complementary', { name: '笔记问答' });
    expect(workspace.contains(chat)).toBe(true);
    expect(chat.parentElement?.classList.contains('with-chat')).toBe(true);
  });

  // it('supports semantic retrieval, reindexing, and explicit lo
  it('supports semantic retrieval, reindexing, and explicit local-agent handoff', async () => {
    const user = userEvent.setup();
    render(<LibraryWorkspace />);

    await user.type(screen.getByRole('textbox', { name: '搜索笔记' }), '矩阵');
    await user.click(screen.getByRole('button', { name: '语义检索' }));
    await waitFor(() => expect(bridge.semanticSearch).toHaveBeenCalledWith('矩阵', 20));
    expect(await screen.findByText('向量命中片段')).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: /打开笔记 矩阵课程笔记/ }));
    await user.click(await screen.findByRole('button', { name: '建立向量索引' }));
    await waitFor(() => expect(bridge.indexNote).toHaveBeenCalledWith('7', expect.stringContaining('核心结论')));

    await user.click(screen.getByRole('button', { name: '发送到本地智能体' }));
    await waitFor(() => expect(bridge.runLocalAgent).toHaveBeenCalledWith(expect.stringContaining('矩阵课程笔记')));
    expect(await screen.findByText('本地智能体处理完成。')).toBeTruthy();
  });

  it('separates real filters, note list, safe reader and selected-note inspector', async () => {
    const user = userEvent.setup();
    render(<LibraryWorkspace />);

    expect(await screen.findByRole('navigation', { name: '笔记分类' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: '笔记列表' })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: /打开笔记 矩阵课程笔记/ }));
    expect(screen.getByRole('main', { name: '笔记正文' })).toBeTruthy();
    const inspector = screen.getByRole('complementary', { name: '笔记信息' });
    expect(inspector.textContent).toContain('矩阵课程笔记');
    expect(inspector.textContent).toContain('数学');
  });
});
