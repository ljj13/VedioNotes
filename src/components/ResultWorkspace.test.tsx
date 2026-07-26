/**
 *测试文件——测试 ResultWorkspace 组件/模块的行为是否符合预期。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultWorkspace from './ResultWorkspace';

const bridge = vi.hoisted(() => ({ getCapabilityStatus: vi.fn(), synthesizeSpeech: vi.fn(), generateNoteImage: vi.fn() }));
vi.mock('../lib/bridge', () => bridge);
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }));

const distillation = {
  core_conclusion: '这是核心结论。',
  key_evidence: [{ text: '第一条依据' }],
  implications: ['执行下一步'],
  transcript: '完整转写正文',
};

// describe('ResultWorkspace', () => {
describe('ResultWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getCapabilityStatus.mockResolvedValue({
      vector: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      rerank: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      webSearch: { enabled: false, configured: false, credentialReady: false, providerId: '' },
      tts: { enabled: true, configured: true, credentialReady: true, providerId: 'mimo' },
      image: { enabled: true, configured: true, credentialReady: true, providerId: 'openai' },
      localAgent: { enabled: false, configured: false, credentialReady: false, providerId: '' },
    });
    bridge.synthesizeSpeech.mockResolvedValue('D:\\AppData\\speech.mp3');
    bridge.generateNoteImage.mockResolvedValue('D:\\AppData\\cover.png');
  });
  // it('renders a reading workspace with semantic TOC and execut
  it('renders a reading workspace with semantic TOC and executable actions', async () => {
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(
      <ResultWorkspace
        distillation={distillation}
        savedPath="D:\\Notes\\result.md"
        transcriptionService="本地 Whisper · CUDA"
        summaryService="DeepSeek"
        onSavedPathChanged={vi.fn()}
        onCopy={onCopy}
        onOpenLibrary={vi.fn()}
        onNewTask={vi.fn()}
      />,
    );

    const toc = screen.getByRole('navigation', { name: '文章目录' });
    expect(toc.textContent).toContain('核心结论');
    expect(toc.textContent).toContain('完整转写');
    await userEvent.setup().click(screen.getByRole('button', { name: '复制全文' }));
    expect(onCopy).toHaveBeenCalledWith(expect.stringContaining('这是核心结论。'));
    expect(screen.getByRole('button', { name: '打开笔记库' })).toBeTruthy();
    expect(screen.getByText('本地 Whisper · CUDA')).toBeTruthy();
  });

  // it('exposes the metadata as a closable responsive drawer', a
  it('exposes the metadata as a closable responsive drawer', async () => {
    render(
      <ResultWorkspace
        distillation={distillation}
        savedPath="D:\\Notes\\result.md"
        transcriptionService="本地 Whisper · CUDA"
        summaryService="DeepSeek"
        onSavedPathChanged={vi.fn()}
        onOpenLibrary={vi.fn()}
        onNewTask={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: '查看结果信息' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await userEvent.setup().click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: '结果信息抽屉' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '关闭结果信息' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  // it('runs read-aloud and cover generation only from explicit
  it('runs read-aloud and cover generation only from explicit result actions', async () => {
    const user = userEvent.setup();
    render(
      <ResultWorkspace
        distillation={distillation}
        savedPath="D:\\Notes\\result.md"
        transcriptionService="本地 Whisper · CUDA"
        summaryService="DeepSeek"
        onSavedPathChanged={vi.fn()}
        onOpenLibrary={vi.fn()}
        onNewTask={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '朗读当前笔记' }));
    await waitFor(() => expect(bridge.synthesizeSpeech).toHaveBeenCalledWith(expect.stringContaining('这是核心结论。')));
    expect(await screen.findByText('朗读文件已生成')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '生成笔记封面' }));
    await waitFor(() => expect(bridge.generateNoteImage).toHaveBeenCalledWith(expect.stringContaining('这是核心结论。')));
    expect(await screen.findByRole('img', { name: '生成的笔记封面' })).toBeTruthy();
  });
});
