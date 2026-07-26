/**
 *关于页——显示应用版本、组件状态、开源声明和本地目录入口。
 */

import { BookOpen, CircleCheck, CircleExclamation, FolderOpen } from '@gravity-ui/icons';
import { Button, Card, Chip, Separator, Typography } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { AboutComponent, AboutSnapshot } from '../../../lib/types';
import { settingsPlatform } from '../../../platform/settings';
import { CIPHERTALK_SETTINGS_SOURCE } from '../sourceManifest';
import type { SettingsEntryProps } from '../settingsTypes';

/** AboutTab */
export default function AboutTab(_props: SettingsEntryProps) {
  const [snapshot, setSnapshot] = useState<AboutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsPlatform.about.getAboutSnapshot().then(setSnapshot).catch((cause) => {
      setError(`加载关于信息失败: ${cause instanceof Error ? cause.message : String(cause)}`);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="tab-content" role="status">正在加载关于信息...</div>;

  const directories = snapshot ? [
    { id: 'app-data', label: '应用数据目录', path: snapshot.appDataDir, open: settingsPlatform.about.openAppDataDirectory },
    { id: 'export', label: 'Markdown 导出目录', path: snapshot.exportDir, open: settingsPlatform.about.openExportDirectory },
    { id: 'logs', label: '诊断日志目录', path: snapshot.logDir, open: settingsPlatform.about.openLogDirectory },
  ] : [];

  const versions = snapshot ? [
    { label: '应用版本', value: `v${snapshot.appVersion}` },
    { label: 'Tauri', value: snapshot.tauriVersion },
    { label: 'React', value: snapshot.frontendVersion },
    { label: 'Rust', value: snapshot.rustVersion },
  ] : [];

  return (
    <div className="tab-content cipher-about-panel">
      {error && <p role="alert" className="text-sm text-danger"><CircleExclamation width={16} className="inline" /> {error}</p>}
      {snapshot && (
        <>
          <section className="cipher-about-hero">
            <div className="cipher-about-logo" aria-hidden="true">VN</div>
            <div className="cipher-about-hero-copy">
              <div className="cipher-about-title-row">
                <Typography.Heading level={2} className="text-2xl font-semibold text-foreground">VedioNotes</Typography.Heading>
                <Chip size="sm" variant="soft" className="cipher-about-version-chip">
                  <Chip.Label className="cipher-about-safe-copy">v{snapshot.appVersion}</Chip.Label>
                </Chip>
              </div>
              <Typography.Paragraph size="sm" color="muted">把视频、字幕和音频整理成可检索、可追问的结构化笔记。</Typography.Paragraph>
              <div className="cipher-about-badges">
                <Chip size="sm" color="success" variant="soft"><CircleCheck width={12} /><Chip.Label>本地数据</Chip.Label></Chip>
                <Chip size="sm" variant="secondary"><Chip.Label>Tauri 2</Chip.Label></Chip>
                <Chip size="sm" variant="secondary"><Chip.Label>WebView2</Chip.Label></Chip>
              </div>
            </div>
          </section>

          <Separator />

          <section className="cipher-about-primary-grid">
            <div className="cipher-about-section">
              <div className="cipher-about-section-heading">
                <Typography.Heading level={3} className="text-lg font-semibold">运行组件</Typography.Heading>
                <Typography.Paragraph size="sm" color="muted">来自当前 VedioNotes 运行环境的真实状态。</Typography.Paragraph>
              </div>
              <div className="cipher-about-component-grid">
                {snapshot.components.map((component: AboutComponent) => (
                  <Card key={component.name} className="cipher-about-component-card">
                    <Card.Header className="cipher-about-component-head">
                      <div className="cipher-about-component-copy cipher-about-safe-copy">
                        <Card.Title>{component.name}</Card.Title>
                        <Card.Description>{component.license}</Card.Description>
                      </div>
                      <Chip
                        size="sm"
                        color={component.status === 'ready' || component.status === 'installed' ? 'success' : 'warning'}
                        variant="soft"
                        className="cipher-about-component-status"
                      >
                        <Chip.Label className="cipher-about-safe-copy">{component.status}</Chip.Label>
                      </Chip>
                    </Card.Header>
                    <Card.Content>
                      <span className="cipher-about-component-version cipher-about-safe-copy">{component.version || '未报告版本'}</span>
                    </Card.Content>
                  </Card>
                ))}
              </div>
            </div>

            <Card className="cipher-about-version-card">
              <Card.Header>
                <Card.Title>版本信息</Card.Title>
                <Card.Description>当前应用和运行框架版本</Card.Description>
              </Card.Header>
              <Card.Content>
                <dl className="cipher-about-version-list">
                  {versions.map((version) => (
                    <div key={version.label} className="cipher-about-version-item">
                      <dt>{version.label}</dt>
                      <dd className="cipher-about-safe-copy">{version.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card.Content>
            </Card>
          </section>

          <section className="cipher-about-links-section">
            <div className="cipher-about-section-heading">
              <Typography.Heading level={3} className="text-lg font-semibold">相关链接</Typography.Heading>
              <Typography.Paragraph size="sm" color="muted">打开 VedioNotes 项目文档。</Typography.Paragraph>
            </div>
            <Button variant="outline" onPress={() => settingsPlatform.about.openDocumentation()}>
              <BookOpen width={16} />项目文档
            </Button>
          </section>

          <section className="cipher-about-section">
            <div className="cipher-about-section-heading">
              <Typography.Heading level={3} className="text-lg font-semibold">本地目录</Typography.Heading>
              <Typography.Paragraph size="sm" color="muted">查看应用数据、Markdown 输出和诊断日志的实际位置。</Typography.Paragraph>
            </div>
            <div className="cipher-about-directory-grid">
              {directories.map((directory) => (
                <Card key={directory.id} className="cipher-about-directory-card">
                  <Card.Header>
                    <Card.Title>{directory.label}</Card.Title>
                  </Card.Header>
                  <Card.Content className="cipher-about-directory-content">
                    <code className="cipher-about-directory-path cipher-about-safe-copy">{directory.path || '未配置'}</code>
                    <Button variant="outline" onPress={() => directory.open()}>
                      <FolderOpen width={16} />打开目录
                    </Button>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </section>

          <section className="cipher-about-section">
            <div className="cipher-about-section-heading">
              <Typography.Heading level={3} className="text-lg font-semibold">第三方来源</Typography.Heading>
              <Typography.Paragraph size="sm" color="muted">保留移植来源、版本和许可证信息。</Typography.Paragraph>
            </div>
            <Card className="cipher-about-source-card">
              <Card.Header>
                <Card.Title>CipherTalk Settings frontend</Card.Title>
                <Card.Description>选择性源码移植并适配 Tauri/Rust</Card.Description>
              </Card.Header>
              <Card.Content>
                <dl className="cipher-about-source-list">
                  <div className="cipher-about-source-row">
                    <dt>Source commit</dt>
                    <dd><code className="cipher-about-safe-copy">{CIPHERTALK_SETTINGS_SOURCE.commit}</code></dd>
                  </div>
                  <div className="cipher-about-source-row">
                    <dt>License</dt>
                    <dd className="cipher-about-safe-copy">{CIPHERTALK_SETTINGS_SOURCE.license}</dd>
                  </div>
                  <div className="cipher-about-source-row">
                    <dt>移植范围</dt>
                    <dd className="cipher-about-safe-copy">保留外观、语音转文字、AI 接入、数据管理和关于页面的结构与视觉行为；未移植 Electron、微信、数据库解密、插件和 updater。</dd>
                  </div>
                </dl>
              </Card.Content>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
