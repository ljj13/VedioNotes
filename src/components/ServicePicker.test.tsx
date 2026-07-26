/**
 *测试文件——测试 ServicePicker 组件/模块的行为是否符合预期。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ServicePicker from './ServicePicker';

const options = [
  { id: 'local', name: 'Whisper Small', meta: '本地 · whisper.cpp', group: '本地服务' },
  { id: 'cloud', name: 'MiMo ASR', meta: '云端 · mimo-v2.5-asr', group: '云端服务' },
];

// describe('ServicePicker', () => {
describe('ServicePicker', () => {
  // it('renders the approved compact trigger and selects from a
  it('renders the approved compact trigger and selects from a grouped listbox', async () => {
    const onSelect = vi.fn();
    render(<ServicePicker label="转写服务" prefix="转写" value="local" options={options} onSelect={onSelect} />);

    const trigger = screen.getByRole('button', { name: '转写服务' });
    expect(trigger.classList.contains('service-trigger')).toBe(true);
    expect(trigger.textContent).toContain('Whisper Small');
    await userEvent.setup().click(trigger);
    expect(screen.getByRole('listbox', { name: '转写服务选项' })).toBeTruthy();
    expect(screen.getByText('本地服务')).toBeTruthy();
    expect(screen.getByText('云端服务')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('option', { name: /MiMo ASR/ }));
    expect(onSelect).toHaveBeenCalledWith('cloud');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // it('supports Arrow navigation, Enter selection and Escape di
  it('supports Arrow navigation, Enter selection and Escape dismissal', async () => {
    const onSelect = vi.fn();
    render(<ServicePicker label="核心总结" prefix="总结" value="" options={options} onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: '核心总结' });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('cloud');

    await userEvent.setup().click(trigger);
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // it('closes on outside pointer input and exposes loading, emp
  it('closes on outside pointer input and exposes loading, empty and disabled states', async () => {
    const { rerender } = render(
      <div><ServicePicker label="转写服务" prefix="转写" value="local" options={options} onSelect={vi.fn()} /></div>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '转写服务' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(<ServicePicker label="转写服务" prefix="转写" value="" options={[]} loading onSelect={vi.fn()} />);
    expect((screen.getByRole('button', { name: '转写服务' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('加载中...')).toBeTruthy();

    rerender(<ServicePicker label="转写服务" prefix="转写" value="" options={[]} onSelect={vi.fn()} />);
    expect((screen.getByRole('button', { name: '转写服务' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('无可用配置')).toBeTruthy();
  });

  // it('marks the selected option without relying on color alone
  it('marks the selected option without relying on color alone', async () => {
    render(<ServicePicker label="转写服务" prefix="转写" value="local" options={options} onSelect={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '转写服务' }));
    const selected = screen.getByRole('option', { name: /Whisper Small/ });
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(selected.querySelector('.service-option-check')).toBeTruthy();
  });

  // it('can hide search for a small closed option set without lo
  it('can hide search for a small closed option set without losing listbox behavior', async () => {
    const onSelect = vi.fn();
    render(<ServicePicker label="笔记风格" prefix="风格" value="local" options={options} onSelect={onSelect} searchable={false} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '笔记风格' }));

    expect(screen.queryByPlaceholderText('搜索配置')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole('option', { name: /MiMo ASR/ }));
    expect(onSelect).toHaveBeenCalledWith('cloud');
  });

  it('closes on Tab without trapping focus or changing the selection', async () => {
    const onSelect = vi.fn();
    render(
      <div>
        <ServicePicker label="转写服务" prefix="转写" value="local" options={options} onSelect={onSelect} searchable={false} />
        <button type="button">下一个控件</button>
      </div>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '转写服务' }));
    expect(screen.getByRole('listbox')).toBeTruthy();

    await user.tab();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
