import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppearancePreferences } from '../../../lib/types';
import { settingsPlatform } from '../../../platform/settings';
import type { SettingsEntryProps } from '../settingsTypes';

const defaults: AppearancePreferences = { theme: 'system', compactDensity: false, reducedMotion: false };

export default function AppearanceTab({
  preferences,
  sidebarCollapsed,
  onPreferencesChanged,
  onToggleSidebar,
}: Pick<SettingsEntryProps, 'preferences' | 'sidebarCollapsed' | 'onPreferencesChanged' | 'onToggleSidebar'>) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const saveSeq = useRef(0);
  const preferencesRef = useRef(preferences);
  const savedPreferencesRef = useRef(preferences);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const applyAndPersist = useCallback((next: AppearancePreferences) => {
    const optimistic = { ...preferencesRef.current, appearance: next };
    preferencesRef.current = optimistic;
    onPreferencesChanged(optimistic);
    const seq = ++saveSeq.current;
    setStatus('saving');
    setError('');
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          const saved = await settingsPlatform.preferences.saveAppearance(next);
          savedPreferencesRef.current = saved;
          if (mountedRef.current && seq === saveSeq.current) {
            preferencesRef.current = saved;
            onPreferencesChanged(saved);
            setStatus('saved');
          }
        } catch (cause) {
          if (mountedRef.current && seq === saveSeq.current) {
            const rollback = savedPreferencesRef.current;
            preferencesRef.current = rollback;
            onPreferencesChanged(rollback);
            setStatus('error');
            setError(cause instanceof Error ? cause.message : '无法保存外观设置');
          }
        }
      });
  }, [onPreferencesChanged]);

  const appearance = preferences.appearance ?? defaults;

  return (
    <section className='cipher-settings-feature' aria-label='外观设置'>
      <header className='cipher-feature-header'>
        <h2>外观</h2>
        <p>主题、内容密度和动画偏好即时生效并自动保存。</p>
      </header>
      <article className='cipher-surface'>
        <div className='cipher-form-grid'>
          <label className='cipher-field'>
            <span>颜色主题</span>
            <select
              aria-label='颜色主题'
              value={appearance.theme}
              onChange={(e) => applyAndPersist({ ...appearance, theme: e.target.value as AppearancePreferences['theme'] })}
            >
              <option value='system'>跟随系统</option>
              <option value='light'>浅色</option>
              <option value='dark'>深色</option>
            </select>
          </label>
        </div>
        <div className='cipher-check-grid'>
          <label className='cipher-toggle'>
            <input
              type='checkbox'
              role='switch'
              aria-label='紧凑布局'
              checked={appearance.compactDensity}
              onChange={(e) => applyAndPersist({ ...appearance, compactDensity: e.currentTarget.checked })}
            />
            <span><strong>紧凑布局</strong><small>缩小列表和设置卡片的垂直间距</small></span>
          </label>
          <label className='cipher-toggle'>
            <input
              type='checkbox'
              role='switch'
              aria-label='减少动画'
              checked={appearance.reducedMotion}
              onChange={(e) => applyAndPersist({ ...appearance, reducedMotion: e.currentTarget.checked })}
            />
            <span><strong>减少动画</strong><small>减少侧栏和浮层的过渡效果</small></span>
          </label>
        </div>
      </article>
      <article className='cipher-preference-card'>
        <div><strong>侧边栏</strong><span>当前{sidebarCollapsed ? '已折叠' : '已展开'}</span></div>
        <button type='button' className='cipher-secondary-action' onClick={onToggleSidebar} aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>{sidebarCollapsed ? '展开' : '折叠'}</button>
      </article>
      {status === 'saving' && <div className='cipher-status info' role='status'>正在自动保存...</div>}
      {status === 'saved' && <div className='cipher-status success' role='status'>外观设置已保存</div>}
      {status === 'error' && <div className='cipher-status warning' role='alert'>{error}</div>}
    </section>
  );
}
