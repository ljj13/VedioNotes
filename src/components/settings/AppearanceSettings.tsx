/**
 * 外观设置面板——用户修改主题、密度和动画偏好.
 * 修改即时生效，通过 saveAppearancePreferences 持久化.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppearancePreferences, AppPreferences } from '../../lib/types';
import { saveAppearancePreferences } from '../../lib/bridge';
import StyledSelect from '../StyledSelect';

const defaults: AppearancePreferences = { theme: 'system', compactDensity: false, reducedMotion: false };

export default function AppearanceSettings({
  preferences,
  sidebarCollapsed,
  onPreferencesChanged,
  onToggleSidebar,
}: {
  preferences: AppPreferences;
  sidebarCollapsed: boolean;
  onPreferencesChanged: (preferences: AppPreferences) => void;
  onToggleSidebar: () => void;
}) {
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
          const saved = await saveAppearancePreferences(next);
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
    <section className='settings-feature' aria-label='外观设置'>
      <header className='settings-feature-header'><h2>外观</h2><p>主题、内容密度和动画偏好即时生效并自动保存。</p></header>
      <article className='settings-surface'>
        <div className='settings-form-grid'>
          <label className='settings-field'><span>颜色主题</span><StyledSelect label='颜色主题' value={appearance.theme} options={[
            { value: 'system', label: '跟随系统', description: '自动匹配 Windows 颜色模式' },
            { value: 'light', label: '浅色', description: '始终使用明亮界面' },
            { value: 'dark', label: '深色', description: '始终使用深色界面' },
          ]} onChange={(theme) => applyAndPersist({ ...appearance, theme: theme as AppearancePreferences['theme'] })} /></label>
        </div>
        <div className='settings-check-grid'>
          <label className='settings-toggle'><input type='checkbox' aria-label='紧凑布局' checked={appearance.compactDensity} onChange={(event) => { const compactDensity = event.currentTarget.checked; applyAndPersist({ ...appearance, compactDensity }); }} /><span><strong>紧凑布局</strong><small>缩小列表和设置卡片的垂直间距</small></span></label>
          <label className='settings-toggle'><input type='checkbox' aria-label='减少动画' checked={appearance.reducedMotion} onChange={(event) => { const reducedMotion = event.currentTarget.checked; applyAndPersist({ ...appearance, reducedMotion }); }} /><span><strong>减少动画</strong><small>减少侧栏和浮层的过渡效果</small></span></label>
        </div>
      </article>
      <article className='preference-card'><div><strong>侧边栏</strong><span>当前{sidebarCollapsed ? '已折叠' : '已展开'}</span></div><button type='button' className='secondary-action' onClick={onToggleSidebar} aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>{sidebarCollapsed ? '展开' : '折叠'}</button></article>
      {status === 'saving' && <div className='settings-status info' role='status'>正在自动保存...</div>}
      {status === 'saved' && <div className='settings-status success' role='status'>外观设置已保存</div>}
      {status === 'error' && <div className='settings-status warning' role='alert'>{error}</div>}
    </section>
  );
}
