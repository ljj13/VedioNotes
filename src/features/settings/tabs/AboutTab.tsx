import { useEffect, useState } from 'react';
import { Card, Button } from '@heroui/react';
import { CircleCheck, CircleExclamation, FolderOpen, BookOpen, Globe } from '@gravity-ui/icons';
import { settingsPlatform } from '../../../platform/settings';
import { CIPHERTALK_SETTINGS_SOURCE } from '../sourceManifest';
import type { AboutSnapshot, AboutComponent } from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';

const REPO_URL = 'https://github.com/ljj13/VedioNotes';
const DOCS_URL = 'https://github.com/ljj13/VedioNotes#readme';

export default function AboutTab(_props: SettingsEntryProps) {
  const [snapshot, setSnapshot] = useState<AboutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsPlatform.about.getAboutSnapshot().then((snap) => {
      setSnapshot(snap);
      setLoading(false);
    }).catch((e) => {
      setError(`加载关于信息失败: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    });
  }, []);

  if (loading) return <div role="status">正在加载关于信息...</div>;

  const componentStatusIcon = (status: string) => {
    if (status === 'ready' || status === 'installed') return <CircleCheck width={14} />;
    return <CircleExclamation width={14} />;
  };

  return (
    <div className="cipher-about-tab">
      <header className="cipher-feature-header">
        <h2>关于 VedioNotes</h2>
        <p>视频核心提炼笔记工具</p>
      </header>

      {error && <div role="alert" className="cipher-error-banner"><CircleExclamation width={16} /> {error}</div>}

      {snapshot && (
        <div className="cipher-about-content">
          {/* Version Info */}
          <Card className="cipher-about-card">
            <div className="cipher-about-row"><strong>应用名称</strong><span>VedioNotes</span></div>
            <div className="cipher-about-row"><strong>版本</strong><span>{snapshot.appVersion}</span></div>
            <div className="cipher-about-row"><strong>Tauri</strong><span>{snapshot.tauriVersion}</span></div>
            <div className="cipher-about-row"><strong>React</strong><span>{snapshot.frontendVersion}</span></div>
            <div className="cipher-about-row"><strong>Rust</strong><span>{snapshot.rustVersion}</span></div>
            <div className="cipher-about-row"><strong>WebView2</strong><span>系统内置</span></div>
          </Card>

          {/* Component Status */}
          {snapshot.components.length > 0 && (
            <section className="cipher-about-section">
              <h3>组件状态</h3>
              <Card className="cipher-components-card">
                {snapshot.components.map((comp: AboutComponent) => (
                  <div key={comp.name} className="cipher-component-item">
                    <span className="cipher-component-status">{componentStatusIcon(comp.status)}</span>
                    <strong>{comp.name}</strong>
                    <span className="cipher-component-version">{comp.version}</span>
                    <span className="cipher-component-license">{comp.license}</span>
                    <span className="cipher-component-state">{comp.status}</span>
                  </div>
                ))}
              </Card>
            </section>
          )}

          {/* Repository and Documentation */}
          <section className="cipher-about-section">
            <h3>仓库与文档</h3>
            <div className="cipher-about-links">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="cipher-about-link">
                <Globe width={16} /> GitHub 仓库
              </a>
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="cipher-about-link">
                <BookOpen width={16} /> 在线文档
              </a>
            </div>
            <div className="cipher-model-actions">
              <Button variant="ghost" onClick={() => settingsPlatform.about.openAppDataDirectory()}>
                <FolderOpen width={14} />打开应用数据目录
              </Button>
              <Button variant="ghost" onClick={() => settingsPlatform.about.openExportDirectory()}>
                <FolderOpen width={14} />打开导出目录
              </Button>
              <Button variant="ghost" onClick={() => settingsPlatform.about.openLogDirectory()}>
                <FolderOpen width={14} />打开日志目录
              </Button>
              <Button variant="ghost" onClick={() => settingsPlatform.about.openDocumentation()}>
                <BookOpen width={14} />打开文档
              </Button>
            </div>
          </section>

          {/* CipherTalk Attribution */}
          <section className="cipher-about-section">
            <h3>第三方来源</h3>
            <Card className="cipher-attribution-card">
              <div className="cipher-attribution-row">
                <strong>设置界面来源</strong>
                <span>CipherTalk</span>
              </div>
              <div className="cipher-attribution-row">
                <strong>源码提交</strong>
                <code>{CIPHERTALK_SETTINGS_SOURCE.commit}</code>
              </div>
              <div className="cipher-attribution-row">
                <strong>许可证</strong>
                <span>{CIPHERTALK_SETTINGS_SOURCE.license}</span>
              </div>
              <div className="cipher-attribution-note">
                VedioNotes 的设置界面（外观、语音转文字、AI 接入、数据管理、关于）的选择性源码移植自 CipherTalk 项目，基于 CC BY-NC-SA 4.0 许可证。移植过程中适配了 Tauri/Rust 后端，移除了 Electron、微信和数据库解密等无关功能。
              </div>
            </Card>
            <p className="cipher-attribution-extra">
              本项目还使用 whisper.cpp (MIT)、sherpa-onnx (Apache-2.0) 等开源项目。详见 <code>THIRD_PARTY_NOTICES.md</code>。
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
