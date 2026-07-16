import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SafeMarkdown from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('hides leading YAML front matter and renders semantic headings and lists', () => {
    render(
      <SafeMarkdown
        content={'---\ntemplate: core_distillation\nstyle: minimal\n---\n# 视频核心提炼\n\n## 关键依据\n\n- **来源**: 公开字幕\n- 第二条\n\n1. 第一步\n2. 第二步'}
      />,
    );

    expect(screen.queryByText(/template: core_distillation/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: '视频核心提炼' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '关键依据' })).toBeTruthy();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('来源').tagName).toBe('STRONG');
  });

  it('renders paragraphs, emphasis, quotes, thematic rules and code', () => {
    const { container } = render(
      <SafeMarkdown
        content={'普通段落包含 *强调*、`行内代码`。\n\n> 只引用笔记依据\n\n---\n\n```text\nconst safe = true;\n```'}
      />,
    );

    expect(screen.getByText('强调').tagName).toBe('EM');
    expect(screen.getByText('行内代码').tagName).toBe('CODE');
    expect(screen.getByText('只引用笔记依据').closest('blockquote')).toBeTruthy();
    expect(container.querySelector('hr')).toBeTruthy();
    expect(screen.getByText('const safe = true;').closest('pre')).toBeTruthy();
  });

  it('links only http and https while keeping raw HTML inert', () => {
    const { container } = render(
      <SafeMarkdown
        content={'[安全来源](https://example.test/watch)\n\n[危险链接](javascript:alert(1))\n\n<script>window.bad = true</script>'}
      />,
    );

    const article = screen.getByRole('article');
    expect(within(article).getByRole('link', { name: '安全来源' }).getAttribute('href')).toBe('https://example.test/watch');
    expect(within(article).queryByRole('link', { name: '危险链接' })).toBeNull();
    expect(article.textContent).toContain('危险链接');
    expect(article.textContent).toContain('<script>window.bad = true</script>');
    expect(container.querySelector('script')).toBeNull();
  });
});
