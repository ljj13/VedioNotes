import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreateWorkspace from './CreateWorkspace';
import InputPanel from './InputPanel';

describe('CreateWorkspace pipeline', () => {
  it('shows four explicit semantic states before work starts', () => {
    render(<CreateWorkspace view="idle" progress={null}><div>输入区域</div></CreateWorkspace>);

    expect(screen.getByText('输入区域')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '新建视频提炼' })).toBeTruthy();
    const pipeline = screen.getByRole('complementary', { name: '处理方案' });
    expect(within(pipeline).getAllByRole('listitem')).toHaveLength(4);
    expect(within(pipeline).getByText('导入与识别').closest('li')?.getAttribute('data-state')).toBe('current');
    expect(within(pipeline).getAllByText('待执行')).toHaveLength(3);
  });

  it('keeps the real start action in the processing plan instead of duplicating it in the source card', () => {
    render(
      <CreateWorkspace view="idle" progress={null}>
        <InputPanel onStart={() => {}} onOpenSettings={() => {}} disabled={false} readyToStart />
      </CreateWorkspace>,
    );

    const plan = screen.getByRole('complementary', { name: '处理方案' });
    expect(within(plan).getByRole('button', { name: '开始提炼' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '视频来源' })).queryByRole('button', { name: '开始提炼' })).toBeNull();
    expect(screen.getAllByRole('radio', { name: /精简|详细|教程|学术|小红书|生活向|任务导向|商业风格|会议纪要/ })).toHaveLength(9);
  });

  it('maps backend progress to the current four-step pipeline state', () => {
    const { rerender } = render(
      <CreateWorkspace view="running" progress={{ stage: 'transcribing', message: '正在转写', percent: 35 }}><div /></CreateWorkspace>,
    );

    expect(screen.getByText('导入与识别').closest('li')?.getAttribute('data-state')).toBe('completed');
    expect(screen.getByText('获取字幕 / 转写').closest('li')?.getAttribute('data-state')).toBe('current');

    rerender(<CreateWorkspace view="running" progress={{ stage: 'saving', message: '正在保存', percent: 94 }}><div /></CreateWorkspace>);
    expect(screen.getByText('保存与索引').closest('li')?.getAttribute('data-state')).toBe('current');
  });

  it('exposes completed and failed states without relying on color alone', () => {
    const { rerender } = render(<CreateWorkspace view="success" progress={null}><div /></CreateWorkspace>);
    expect(within(screen.getByRole('list')).getAllByText('已完成')).toHaveLength(4);

    rerender(<CreateWorkspace view="error" progress={{ stage: 'distilling', message: '失败', percent: 75 }}><div /></CreateWorkspace>);
    expect(screen.getByText('核心提炼').closest('li')?.getAttribute('data-state')).toBe('failed');
    expect(screen.getByText('失败')).toBeTruthy();
  });
});
