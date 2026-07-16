import { Palette, Microphone, Sparkles, HardDrive, CircleInfo } from '@gravity-ui/icons';
import { Suspense, lazy } from 'react';
import { Tabs, ScrollShadow } from '@heroui/react';
import type { SettingsEntryProps } from './settingsTypes';
import type { CipherSettingsPageId } from './sourceManifest';

const AppearanceTab = lazy(() => import('./tabs/AppearanceTab'));
const TranscriptionTab = lazy(() => import('./tabs/TranscriptionTab'));
const AiAccessTab = lazy(() => import('./tabs/AiAccessTab'));
const DataManagementTab = lazy(() => import('./tabs/DataManagementTab'));
const AboutTab = lazy(() => import('./tabs/AboutTab'));

const tabs: Array<{ id: CipherSettingsPageId; label: string; icon: React.ElementType }> = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'transcription', label: '语音转文字', icon: Microphone },
  { id: 'ai', label: 'AI 接入', icon: Sparkles },
  { id: 'data', label: '数据管理', icon: HardDrive },
  { id: 'about', label: '关于', icon: CircleInfo },
];

function SettingsTabSkeleton() {
  return (
    <div className="cipher-settings-skeleton" role="status" aria-label="正在加载设置页面">
      <div className="cipher-skeleton-line" style={{ width: '40%' }} />
      <div className="cipher-skeleton-line" style={{ width: '80%' }} />
      <div className="cipher-skeleton-line" style={{ width: '60%' }} />
    </div>
  );
}

export default function CipherSettingsShell(props: SettingsEntryProps) {
  const activeTab = props.section;
  return (
    <div className="cipher-settings-root" data-theme={props.theme}>
      <div className="cipher-settings-header">
        <button className="cipher-back-btn" onClick={props.onReturn} aria-label="返回工作台">
          ← 返回
        </button>
      </div>
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => props.onSelectSection(String(key) as SettingsEntryProps['section'])}
        className="cipher-settings-tabs"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="设置分类">
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.id} id={tab.id}>
                <tab.icon width={16} height={16} />
                {tab.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <ScrollShadow className="cipher-settings-body" hideScrollBar size={64}>
        {activeTab === 'appearance' && (
          <Suspense fallback={<SettingsTabSkeleton />}><AppearanceTab {...props} /></Suspense>
        )}
        {activeTab === 'transcription' && (
          <Suspense fallback={<SettingsTabSkeleton />}><TranscriptionTab {...props} /></Suspense>
        )}
        {activeTab === 'ai' && (
          <Suspense fallback={<SettingsTabSkeleton />}><AiAccessTab {...props} /></Suspense>
        )}
        {activeTab === 'data' && (
          <Suspense fallback={<SettingsTabSkeleton />}><DataManagementTab {...props} /></Suspense>
        )}
        {activeTab === 'about' && (
          <Suspense fallback={<SettingsTabSkeleton />}><AboutTab {...props} /></Suspense>
        )}
      </ScrollShadow>
    </div>
  );
}
