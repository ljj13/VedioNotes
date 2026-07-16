import { useEffect, useState } from 'react';
import { Card } from '@heroui/react';
import { settingsPlatform } from '../../../platform/settings';
import type { SummaryProviderCatalogEntry } from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';

export default function AiAccessTab({ profiles }: SettingsEntryProps) {
  const [catalog, setCatalog] = useState<SummaryProviderCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsPlatform.ai.getCatalog().then((entries) => {
      setCatalog(entries);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="cipher-ai-tab">
      <header className="cipher-feature-header">
        <h2>AI 接入</h2>
        <p>配置大语言模型和 AI 能力服务。</p>
      </header>

      {loading && <div role="status">正在加载服务商目录...</div>}

      {!loading && (
        <div className="cipher-ai-section">
          <h3>大语言模型</h3>
          <p>当前已配置 {profiles.summaryProfiles.length} 个摘要服务商。</p>
          {profiles.summaryProfiles.map((profile) => (
            <Card key={profile.id} className="cipher-profile-card">
              <div><strong>{profile.name}</strong><span>{profile.provider}</span></div>
              <div>{profile.model ?? '未设置模型'}</div>
            </Card>
          ))}

          <h4>可用服务商 ({catalog.length})</h4>
          <div className="cipher-catalog-grid">
            {catalog.slice(0, 20).map((entry) => (
              <Card key={entry.id} className="cipher-catalog-card">
                <div><strong>{entry.displayName}</strong></div>
                <div>{entry.models?.length ?? 0} 个模型</div>
              </Card>
            ))}
          </div>
          {catalog.length > 20 && <p>...共 {catalog.length} 个服务商</p>}
        </div>
      )}
    </div>
  );
}
