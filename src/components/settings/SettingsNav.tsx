import type { SettingsSection } from '../../lib/workbenchNavigation';

type Item = { id: SettingsSection; label: string };

export default function SettingsNav({ items, value, onChange }: { items: Item[]; value: SettingsSection; onChange: (value: SettingsSection) => void }) {
  return <nav className="settings-tabs-v2" aria-label="设置导航" role="tablist">
    {items.map((item) => <button
      key={item.id}
      type="button"
      role="tab"
      aria-label={item.label}
      aria-selected={item.id === value}
      aria-current={item.id === value ? 'page' : undefined}
      className={item.id === value ? 'active' : ''}
      onClick={() => onChange(item.id)}
    >{item.label}</button>)}
  </nav>;
}
