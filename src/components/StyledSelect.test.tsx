/**
 *测试文件——测试 StyledSelect 组件/模块的行为是否符合预期。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StyledSelect from './StyledSelect';

const options = [
  { value: 'deepseek', label: 'DeepSeek', description: 'OpenAI Compatible' },
  { value: 'openai', label: 'OpenAI', description: 'Responses API' },
  { value: 'ollama', label: 'Ollama', description: '本地服务' },
];

// describe('StyledSelect', () => {
describe('StyledSelect', () => {
  // it('opens a custom rounded listbox and reports the selected
  it('opens a custom rounded listbox and reports the selected option', async () => {
    const onChange = vi.fn();
    render(<StyledSelect label="服务商" value="deepseek" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: '服务商' });
    expect(trigger.classList.contains('styled-select-trigger')).toBe(true);
    await userEvent.setup().click(trigger);
    const listbox = screen.getByRole('listbox', { name: '服务商选项' });
    expect(listbox.classList.contains('styled-select-menu')).toBe(true);
    expect(screen.getByRole('option', { name: /DeepSeek/ }).getAttribute('aria-selected')).toBe('true');

    await userEvent.setup().click(screen.getByRole('option', { name: /^OpenAI/ }));
    expect(onChange).toHaveBeenCalledWith('openai');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // it('supports Arrow keys, Enter, Escape, and outside dismissa
  it('supports Arrow keys, Enter, Escape, and outside dismissal', async () => {
    const onChange = vi.fn();
    render(<StyledSelect label="模型" value="deepseek" options={options} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: '模型' });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('openai');

    await userEvent.setup().click(trigger);
    fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await userEvent.setup().click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // it('has a disabled state and does not rely on color for sele
  it('has a disabled state and does not rely on color for selection', async () => {
    const { rerender } = render(<StyledSelect label="协议" value="deepseek" options={options} onChange={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '协议' }));
    expect(screen.getByRole('option', { name: /DeepSeek/ }).querySelector('.styled-select-check')).toBeTruthy();

    rerender(<StyledSelect label="协议" value="deepseek" options={options} onChange={vi.fn()} disabled />);
    expect((screen.getByRole('button', { name: '协议' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
