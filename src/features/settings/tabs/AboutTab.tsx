import { useEffect, useState } from 'react';
import { Card } from '@heroui/react';
import { settingsPlatform } from '../../../platform/settings';
import type { AboutSnapshot } from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';

export default function AboutTab(_props: SettingsEntryProps) {
  const [snapshot, setSnapshot] = useState<AboutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsPlatform.about.getAboutSnapshot().then((snap) => {
      setSnapshot(snap);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div role="status">正在加载关于信息...</div>;

  return (
    <div className="cipher-about-tab">
      <header className="cipher-feature-header">
        <h2>关于</h2>
        <p>VedioNotes — 视频核心提炼笔记工具</p>
      </header>

      {snapshot && (
        <div className="cipher-about-content">
          <Card className="cipher-about-card">
            <div><strong>版本</strong><span>{snapshot.appVersion}</span></div>
            <div><strong>Tauri</strong><span>{snapshot.tauriVersion}</span></div>
            <div><strong>React</strong><span>{snapshot.frontendVersion}</span></div>
            <div><strong>Rust</strong><span>{snapshot.rustVersion}</span></div>
          </Card>

          {snapshot.components?.length > 0 && (
            <section>
              <h3>已安装组件</h3>
              {snapshot.components.map((comp) => (
                <div key={comp.name} className="cipher-component-item">
                  <strong>{comp.name}</strong>
                  <span>{comp.version}</span>
                  <span>{comp.status}</span>
                </div>
              ))}
            </section>
          )}

          <section>
            <h3>开源许可</h3>
            <p>本项目使用了 CipherTalk (CC BY-NC-SA 4.0)、whisper.cpp (MIT)、sherpa-onnx (Apache-2.0) 等开源项目。详见 THIRD_PARTY_NOTICES.md。</p>
          </section>
        </div>
      )}
    </div>
  );
}
