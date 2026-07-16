import { lazy, Suspense } from 'react';
import LegacySettingsWorkspace from '../../components/SettingsWorkspace';
import type { SettingsEntryProps } from './settingsTypes';

const CipherSettingsShell = lazy(() => import('./CipherSettingsShell'));

export default function SettingsEntry({
  implementation: override,
  ...props
}: SettingsEntryProps & { implementation?: 'legacy' | 'cipher' }) {
  const implementation = override
    ?? (import.meta.env.VITE_SETTINGS_IMPLEMENTATION === 'cipher' ? 'cipher' : 'legacy');
  if (implementation === 'legacy') return <LegacySettingsWorkspace {...props} />;
  return (
    <Suspense fallback={<div role="status">正在加载设置…</div>}>
      <CipherSettingsShell {...props} />
    </Suspense>
  );
}
