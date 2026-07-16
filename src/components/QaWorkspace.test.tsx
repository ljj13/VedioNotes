import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QaWorkspace from './QaWorkspace';

const bridge = vi.hoisted(() => ({ searchLibrary: vi.fn(), askHistoryNote: vi.fn(), getCapabilityStatus: vi.fn(), webSearch: vi.fn() }));
vi.mock('../lib/bridge', () => bridge);

describe('QaWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.searchLibrary.mockResolvedValue({
      entries: [{ id: 9, title: '傅里叶变换', source: 'local', noteTemplate: 'core_distillation', noteStyle: 'academic', createdAt: 'now', markdownPath: 'a.md', transcriptPath: 'a.txt', thumbnailPath: null, screenshotPaths: [], favorite: false, tags: [], lastOpenedAt: null }],
      tags: [],
      total: 1,
    });
    bridge.askHistoryNote.mockResolvedValue([
      { role: 'user', content: '核心结论是什么？' },
      { role: 'assistant', content: '只根据所选笔记回答。' },
    ]);
    bridge.getCapabilityStatus.mockResolvedValue({
      vector: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      rerank: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      webSearch: { enabled: true, configured: true, credentialReady: true, providerId: 'tavily' },
      tts: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      image: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      localAgent: { enabled: false, configured: false, credentialReady: false, providerId: '' },
    });
    bridge.webSearch.mockResolvedValue([{ title: '外部资料', url: 'https://example.test/source', snippet: '可核对的外部事实。' }]);
  });

  it('requires a selected note and sends questions only through the same-note backend', async () => {
    const user = userEvent.setup();
    render(<QaWorkspace />);

    expect(await screen.findByText('先选择一篇笔记')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: /选择笔记 傅里叶变换/ }));
    await user.type(screen.getByRole('textbox', { name: '向所选笔记提问' }), '核心结论是什么？');
    await user.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => expect(bridge.askHistoryNote).toHaveBeenCalledWith(9, '核心结论是什么？'));
    expect(await screen.findByText('只根据所选笔记回答。')).toBeTruthy();
  });

  it('keeps web assistance explicit and renders attributed search results separately', async () => {
    const user = userEvent.setup();
    render(<QaWorkspace />);

    await user.click(await screen.findByRole('button', { name: /选择笔记 傅里叶变换/ }));
    await user.type(screen.getByRole('textbox', { name: '向所选笔记提问' }), '最近有哪些新进展？');
    await user.click(screen.getByRole('button', { name: '联网检索' }));

    await waitFor(() => expect(bridge.webSearch).toHaveBeenCalledWith('最近有哪些新进展？'));
    const source = await screen.findByRole('link', { name: '外部资料' });
    expect(source.getAttribute('href')).toBe('https://example.test/source');
    expect(screen.getByText('可核对的外部事实。')).toBeTruthy();
  });
});
