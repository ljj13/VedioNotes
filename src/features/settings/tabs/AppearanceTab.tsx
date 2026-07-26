/**
 *外观设置页——主题切换、内容密度、动画偏好和侧栏折叠。
 */

import { Display, Moon, Sun } from '@gravity-ui/icons';
import { Card, Switch, Tabs, type Key } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppearancePreferences } from '../../../lib/types';
import { settingsPlatform } from '../../../platform/settings';
import type { SettingsEntryProps } from '../settingsTypes';

const defaults: AppearancePreferences = { theme: 'system', compactDensity: false, reducedMotion: false };

/** AppearanceTab */
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

  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const applyAndPersist = useCallback((next: AppearancePreferences) => {
    const optimistic = { ...preferencesRef.current, appearance: next };
    preferencesRef.current = optimistic;
    onPreferencesChanged(optimistic);
    const seq = ++saveSeq.current;
    setStatus('saving');
    setError('');
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
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
  const setTheme = (key: Key) => applyAndPersist({ ...appearance, theme: String(key) as AppearancePreferences['theme'] });

  return (
    <div className="tab-content space-y-8" aria-label="外观设置">
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">外观</h2>
        <p className="text-sm text-muted">主题、内容密度和动画偏好即时生效并自动保存。</p>
      </section>

      <section className="space-y-4">
        <h3 className="section-title">主题模式</h3>
        <Tabs selectedKey={appearance.theme} onSelectionChange={setTheme} className="w-full max-w-md">
          <Tabs.ListContainer>
            <Tabs.List aria-label="外观模式" className="*:gap-2">
              <Tabs.Tab id="light"><Sun width={16} height={16} aria-hidden />浅色<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="dark"><Moon width={16} height={16} aria-hidden />深色<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="system"><Display width={16} height={16} aria-hidden />跟随系统<Tabs.Indicator /></Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Card.Header><Card.Title>内容密度</Card.Title><Card.Description>调整列表和设置区域的垂直间距。</Card.Description></Card.Header>
          <Card.Content>
            <Switch aria-label="紧凑布局" isSelected={appearance.compactDensity} onChange={(selected) => applyAndPersist({ ...appearance, compactDensity: selected })}>
              <Switch.Control><Switch.Thumb /></Switch.Control>
              <Switch.Content><strong>紧凑布局</strong><span className="text-sm text-muted">在有限窗口中显示更多内容</span></Switch.Content>
            </Switch>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header><Card.Title>动态效果</Card.Title><Card.Description>控制侧栏、浮层和页面切换动画。</Card.Description></Card.Header>
          <Card.Content>
            <Switch aria-label="减少动画" isSelected={appearance.reducedMotion} onChange={(selected) => applyAndPersist({ ...appearance, reducedMotion: selected })}>
              <Switch.Control><Switch.Thumb /></Switch.Control>
              <Switch.Content><strong>减少动画</strong><span className="text-sm text-muted">降低非必要过渡和位移动画</span></Switch.Content>
            </Switch>
          </Card.Content>
        </Card>
      </section>

      <Card className="max-w-2xl">
        <Card.Header><Card.Title>导航布局</Card.Title><Card.Description>当前工作台使用侧边栏导航。</Card.Description></Card.Header>
        <Card.Content className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">侧边栏当前{sidebarCollapsed ? '已折叠' : '已展开'}</span>
          <button type="button" className="btn btn-secondary" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>{sidebarCollapsed ? '展开' : '折叠'}</button>
        </Card.Content>
      </Card>

      <div aria-live="polite">
        {status === 'saving' && <p className="text-sm text-muted" role="status">正在自动保存...</p>}
        {status === 'saved' && <p className="text-sm text-success" role="status">外观设置已保存</p>}
        {status === 'error' && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
