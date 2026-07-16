import { useId, useMemo, useRef, useState } from 'react';

export type SearchableComboboxOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export default function SearchableCombobox({
  label,
  value,
  options,
  onChange,
  allowCustom = false,
  placeholder,
  disabled = false,
  maxResults = 80,
}: {
  label: string;
  value: string;
  options: SearchableComboboxOption[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
  placeholder?: string;
  disabled?: boolean;
  maxResults?: number;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputValue = open ? query : (selected?.label ?? value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => options.filter((option) => {
    if (!normalizedQuery) return true;
    return `${option.label} ${option.value} ${option.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery);
  }).slice(0, maxResults), [maxResults, normalizedQuery, options]);
  const exactMatch = options.some((option) => option.value.toLocaleLowerCase() === normalizedQuery || option.label.toLocaleLowerCase() === normalizedQuery);

  const choose = (next: string) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  return (
    <div
      className={`searchable-combobox ${open ? 'is-open' : ''}`}
      ref={rootRef}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery('');
        }
      }}
    >
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={inputValue}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setQuery(next);
          setOpen(true);
          if (allowCustom) onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
          } else if (event.key === 'Enter' && allowCustom && query.trim() && !exactMatch) {
            event.preventDefault();
            choose(query.trim());
          }
        }}
      />
      <svg aria-hidden="true" className="searchable-combobox-chevron" viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" /></svg>
      {open && !disabled && (
        <div className="searchable-combobox-menu" id={listboxId} role="listbox" aria-label={`${label.replace(/^搜索(?:或输入)?\s*/, '')}选项`}>
          {filtered.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              className="searchable-combobox-option"
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.value)}
            >
              <span><strong>{option.label}</strong><small>{option.description || option.value}</small></span>
              {option.value === value && <span className="searchable-combobox-check" aria-hidden="true">✓</span>}
            </button>
          ))}
          {allowCustom && query.trim() && !exactMatch && (
            <button
              type="button"
              role="option"
              aria-selected={query.trim() === value}
              className="searchable-combobox-option custom-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(query.trim())}
            >
              <span><strong>使用自定义模型</strong><small>{query.trim()}</small></span>
            </button>
          )}
          {filtered.length === 0 && !(allowCustom && query.trim()) && <p className="searchable-combobox-empty">没有匹配项</p>}
        </div>
      )}
    </div>
  );
}
