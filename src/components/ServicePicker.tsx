import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type ServicePickerOption = {
  id: string;
  name: string;
  meta: string;
  group: string;
};

type Props = {
  label: string;
  prefix: string;
  value: string;
  options: ServicePickerOption[];
  onSelect: (id: string) => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchable?: boolean;
};

export default function ServicePicker({
  label,
  prefix,
  value,
  options,
  onSelect,
  loading = false,
  disabled = false,
  placeholder = '请选择可用配置',
  searchable = true,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.id === value) ?? null;
  const unavailable = loading || options.length === 0;
  const isDisabled = disabled || unavailable;

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.name} ${option.meta} ${option.group}`.toLocaleLowerCase().includes(normalized),
    );
  }, [options, query]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ServicePickerOption[]>();
    for (const option of filteredOptions) {
      const current = grouped.get(option.group) ?? [];
      current.push(option);
      grouped.set(option.group, current);
    }
    return Array.from(grouped.entries());
  }, [filteredOptions]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filteredOptions.findIndex((option) => option.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, value, filteredOptions]);

  useEffect(() => {
    if (!open || filteredOptions.length === 0) return;
    optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideInput = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideInput);
    return () => document.removeEventListener('pointerdown', closeOnOutsideInput);
  }, [open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const selectAt = (index: number) => {
    const option = filteredOptions[index];
    if (!option) return;
    void onSelect(option.id);
    closeAndRestoreFocus();
  };

  const handleNavigation = (event: React.KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndRestoreFocus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(filteredOptions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
    } else if (event.key === 'Enter' && document.activeElement?.getAttribute('role') === 'option') {
      event.preventDefault();
      selectAt(activeIndex);
    }
  };

  const visibleValue = loading
    ? '加载中...'
    : options.length === 0
      ? '无可用配置'
      : selected?.name ?? placeholder;

  return (
    <div className={`service-picker ${open ? 'is-open' : ''}`} ref={rootRef} onKeyDown={handleNavigation}>
      <button
        ref={triggerRef}
        className="service-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !isDisabled) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <span className="service-trigger-prefix">{prefix}</span>
        <span className="service-trigger-copy">
          <strong>{visibleValue}</strong>
          {selected && <small>{selected.meta}</small>}
        </span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="service-menu">
          {searchable && <label className="service-search">
            <span className="sr-only">搜索{label}</span>
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder="搜索配置"
            />
          </label>}
          <div id={listboxId} className="service-listbox" role="listbox" aria-label={`${label}选项`}>
            {groups.length === 0 ? (
              <p className="service-empty">没有匹配的配置</p>
            ) : groups.map(([group, groupOptions]) => (
              <div className="service-option-group" key={group}>
                <div className="service-group-label">{group}</div>
                {groupOptions.map((option) => {
                  const index = filteredOptions.findIndex((candidate) => candidate.id === option.id);
                  const isSelected = option.id === value;
                  return (
                    <button
                      key={option.id}
                      ref={(element) => { optionRefs.current[index] = element; }}
                      className="service-option"
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={index === activeIndex ? 0 : -1}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectAt(index)}
                    >
                      <span className="service-option-mark" aria-hidden="true">{option.name.slice(0, 1).toUpperCase()}</span>
                      <span className="service-option-copy"><strong>{option.name}</strong><small>{option.meta}</small></span>
                      {isSelected && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return <svg className="service-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}

function CheckIcon() {
  return <svg className="service-option-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}
