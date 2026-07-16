import { useEffect, useState } from 'react';
import type { AboutSnapshot } from '../../lib/types';
import { getAboutSnapshot, openAppDataDirectory, openDocumentation, openExportDirectory, openLogDirectory } from '../../lib/bridge';

export default function AboutSettings() {
  const [about, setAbout] = useState<AboutSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getAboutSnapshot().then((snapshot) => active && setAbout(snapshot)).catch((cause) => active && setError(cause instanceof Error ? cause.message : '无法读取版本信息。'));
    return () => { active = false; };
  }, []);

  return (
    <section className="settings-feature" aria-label="关于">
      <header className="settings-feature-header"><h2>关于</h2><p>以下版本、组件状态和目录信息均由 Rust 后端在当前设备上读取。</p></header>
      {about ? <>
        <article className="settings-surface about-card"><div className="about-mark">V</div><div><h3>视频提炼</h3><p>版本 <span className="about-version">{about.appVersion}</span> · Tauri {about.tauriVersion} · {about.frontendVersion}</p><small>{about.rustVersion}</small></div><dl><div><dt>应用数据</dt><dd>{about.appDataDir}</dd></div><div><dt>导出目录</dt><dd>{about.exportDir}</dd></div><div><dt>日志目录</dt><dd>{about.logDir}</dd></div></dl></article>
        <div className="about-component-grid">{about.components.map((component) => <article className="settings-surface about-component" key={component.name}><div><strong>{component.name}</strong><span className={`component-status ${component.status}`}>{component.status}</span></div><p>{component.version}</p><small>{component.license}</small></article>)}</div>
        <div className="settings-actions"><button type="button" className="secondary-action" onClick={() => void openAppDataDirectory()}>打开应用数据目录</button><button type="button" className="secondary-action" onClick={() => void openExportDirectory()}>打开导出目录</button><button type="button" className="secondary-action" onClick={() => void openLogDirectory()}>打开日志目录</button><button type="button" className="secondary-action" onClick={() => void openDocumentation()}>查看使用文档</button></div>
      </> : !error && <div className="settings-status info" role="status">正在读取运行信息…</div>}
      {error && <div className="settings-status warning" role="alert">{error}</div>}
    </section>
  );
}
