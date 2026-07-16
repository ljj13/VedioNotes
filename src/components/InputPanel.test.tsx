import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InputPanel from './InputPanel';

vi.mock('../lib/localMedia', () => ({ openLocalMedia: vi.fn(), subscribeToMediaDrop: vi.fn().mockResolvedValue(() => {}) }));

describe('InputPanel workbench inputs', () => {
  it('blocks an unready SenseVoice task with a settings recovery action', () => {
    const onOpenSettings = vi.fn();
    render(<InputPanel onStart={vi.fn()} onOpenSettings={onOpenSettings} disabled={false} readyToStart={false} transcriptionMode="sensevoice_cpu" senseVoiceUnready />);
    expect(screen.getByText('请先在设置中一键安装并启用 SenseVoice。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
  it('offers separate accessible link and local-file tabs', async () => {
    render(<InputPanel onStart={vi.fn()} onOpenSettings={vi.fn()} disabled={false} readyToStart />);
    expect(screen.getByRole('tab', { name: '视频链接' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('tab', { name: '本地文件' }));
    expect(screen.getByLabelText('拖放视频或音频文件，或点击选择')).toBeTruthy();
    expect(screen.queryByLabelText('视频链接')).toBeNull();
  });

  it('recognizes supported platform links and lets the user clear the URL', async () => {
    render(<InputPanel onStart={vi.fn()} onOpenSettings={vi.fn()} disabled={false} readyToStart />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('视频链接');

    await user.type(input, 'https://www.bilibili.com/video/BV1xx411c7mD');
    expect(screen.getByText('已识别 Bilibili 链接')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '清空视频链接' }));
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('已识别 Bilibili 链接')).toBeNull();
  });

  it('preserves the screenshot option in the create flow', async () => {
    const onStart = vi.fn();
    render(<InputPanel onStart={onStart} onOpenSettings={vi.fn()} disabled={false} readyToStart />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('视频链接'), 'https://youtu.be/example');
    await user.click(screen.getByRole('checkbox', { name: '关键截图' }));
    await user.click(screen.getByRole('button', { name: '开始提炼' }));
    expect(onStart).toHaveBeenCalledWith(
      { kind: 'youtube_url', url: 'https://youtu.be/example' },
      { note_template: 'core_distillation', include_screenshots: true, note_style: 'minimal', transcription_mode: 'online_profile', sensevoice_model: 'int8', sensevoice_languages: ['zh'] },
    );
  });

  it('submits the selected closed note style with the task', async () => {
    const onStart = vi.fn();
    render(<InputPanel onStart={onStart} onOpenSettings={vi.fn()} disabled={false} readyToStart />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('视频链接'), 'https://youtu.be/academic');
    expect(screen.getAllByRole('radio')).toHaveLength(9);
    await user.click(screen.getByRole('radio', { name: /学术/ }));
    await user.click(screen.getByRole('button', { name: '开始提炼' }));

    expect(onStart).toHaveBeenCalledWith(
      { kind: 'youtube_url', url: 'https://youtu.be/academic' },
      { note_template: 'core_distillation', include_screenshots: false, note_style: 'academic', transcription_mode: 'online_profile', sensevoice_model: 'int8', sensevoice_languages: ['zh'] },
    );
  });
});
