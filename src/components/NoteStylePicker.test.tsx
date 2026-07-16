import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NoteStylePicker from './NoteStylePicker';

describe('NoteStylePicker', () => {
  it('renders the nine BiliNote-inspired choices and exposes the selected label', async () => {
    const onChange = vi.fn();
    render(<NoteStylePicker value="minimal" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: '笔记风格' });
    expect(trigger.textContent).toContain('精简');
    await userEvent.setup().click(trigger);
    expect(screen.getAllByRole('option')).toHaveLength(9);
    expect(screen.getByRole('option', { name: /精简/ }).getAttribute('aria-selected')).toBe('true');

    await userEvent.setup().click(screen.getByRole('option', { name: /会议纪要/ }));
    expect(onChange).toHaveBeenCalledWith('meeting_minutes');
  });

  it('disables its trigger with the surrounding task form', () => {
    render(<NoteStylePicker value="minimal" onChange={vi.fn()} disabled />);
    expect((screen.getByRole('button', { name: '笔记风格' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
