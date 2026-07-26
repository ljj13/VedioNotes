/** result-evidence.test 测试 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResultPanel from '../src/components/ResultPanel';

const core = vi.hoisted(() => ({ convertFileSrc: vi.fn((path: string) => `asset://converted/${path}`) }));
vi.mock('@tauri-apps/api/core', () => core);
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('../src/lib/bridge', () => ({ copyMarkdownResult: vi.fn() }));

function renderEvidence(source_url?: string) {
  render(<ResultPanel onSavedPathChanged={() => {}} savedPath={null} distillation={{
    core_conclusion: 'Conclusion', implications: [], key_evidence: [{ text: 'Evidence', timestamp_seconds: 65, source_url, screenshot_path: 'C:\\frames\\65.jpg' }],
  }} />);
}

// describe('ResultPanel evidence', () => {
describe('ResultPanel evidence', () => {
  // it('uses Bilibili ?t=seconds timestamp links and converts fi
  it('uses Bilibili ?t=seconds timestamp links and converts filesystem thumbnails', () => {
    renderEvidence('https://www.bilibili.com/video/BV1?p=2');
    expect(screen.getByRole('link', { name: '01:05' })).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1?p=2&t=65');
    expect(core.convertFileSrc).toHaveBeenCalledWith('C:\\frames\\65.jpg');
    expect(screen.getByRole('img', { name: 'Evidence 截图' })).toHaveAttribute('src', 'asset://converted/C:\\frames\\65.jpg');
  });

  // it('uses YouTube &t=seconds+s timestamp links', () => {
  it('uses YouTube &t=seconds+s timestamp links', () => {
    renderEvidence('https://www.youtube.com/watch?v=abc');
    expect(screen.getByRole('link', { name: '01:05' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc&t=65s');
  });

  it.each([undefined, 'https://www.douyin.com/video/1', 'https://www.youtube.com.evil.example/watch?v=abc'])('renders a plain timestamp for non-linkable source %s', (source) => {
    renderEvidence(source);
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '01:05' })).not.toBeInTheDocument();
  });
});
