import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type StyledSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type Props = {
  label: string;
  value: string;
  options: StyledSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export default function StyledSelect({
  label,
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, []);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const openMenu = (direction: 1 | -1 = 1) => {
    if (disabled || enabledIndexes.length === 0) return;
    const selectedEnabledPosition = enabledIndexes.indexOf(selectedIndex);
    const nextPosition = selectedEnabledPosition >= 0
      ? selectedEnabledPosition
      : direction === 1 ? 0 : enabledIndexes.length - 1;
    setActiveIndex(enabledIndexes[nextPosition]);
    setOpen(true);
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const move = (direction: 1 | -1) => {
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? direction === 1 ? 0 : enabledIndexes.length - 1
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  };

  const choose = (option: StyledSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu(true);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: StyledSelectOption) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1] ?? -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(option);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      closeMenu(event.key === 'Escape');
    }
  };

  return (
    <div ref={rootRef} className={`styled-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="styled-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled || options.length === 0}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="styled-select-copy">
          <strong>{selected?.label ?? placeholder}</strong>
          {selected?.description && <small>{selected.description}</small>}
        </span>
        <svg className="styled-select-chevron" aria-hidden="true" viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg>
      </button>
      {open && (
        <div id={listboxId} className="styled-select-menu" role="listbox" aria-label={`${label}选项`}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              className="styled-select-option"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onClick={() => choose(option)}
              onKeyDown={(event) => handleOptionKeyDown(event, option)}
            >
              <span className="styled-select-option-copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
              <svg className="styled-select-check" aria-hidden="true" viewBox="0 0 20 20"><path d="m5 10 3 3 7-7" /></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
