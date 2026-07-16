import { useEffect, useMemo, useState } from 'react';
import type {
  CacheCategory,
  CacheUsage,
  ExportPreferences,
  LogDescriptor,
  LogLevel,
  LogTail,
} from '../../lib/types';
import {
  clearCache,
  clearLogs,
  getCacheUsage,
  getExportPreferences,
  listLogs,
  openExportDirectory,
  openLogDirectory,
  readLog,
  restoreExportPreferences,
  saveExportPreferences,
  setLogLevel,
} from '../../lib/bridge';
import DownloadSettings from '../DownloadSettings';
import OutputSettings from '../OutputSettings';
import StyledSelect from '../StyledSelect';

type DataMode = 'export' | 'cache' | 'downloads' | 'logs';

const defaultExportPreferences: ExportPreferences = {
  format: 'markdown',
  includeScreenshots: true,
  includeSubtitles: true,
  includeSourceMetadata: true,
  includeDiagnosticLog: false,
};

const cacheLabels: Record<Exclude<CacheCategory, 'all'>, string> = {
  temporary_media: '临时媒体',
  screenshots: '截图',
  transcription_intermediates: '转写中间文件',
  ai_index: 'AI 索引',
};

const logLevelOptions = [
  { value: 'debug', label: '调试', description: '记录最完整的诊断信息' },
  { value: 'info', label: '信息', description: '推荐的日常日志级别' },
  { value: 'warning', label: '警告', description: '记录需要关注的运行状态' },
  { value: 'error', label: '错误', description: '仅记录需要处理的问题' },
];

export default function DataManagementSettings({ initialLogLevel = 'info' }: { initialLogLevel?: LogLevel }) {
  const [mode, setMode] = useState<DataMode>('export');
  const [exportPreferences, setExportPreferences] = useState(defaultExportPreferences);
  const [usage, setUsage] = useState<CacheUsage>({ totalBytes: 0, categories: [] });
  const [logs, setLogs] = useState<LogDescriptor[]>([]);
  const [logLevel, setCurrentLogLevel] = useState<LogLevel>(initialLogLevel);
  const [selectedLog, setSelectedLog] = useState<LogTail | null>(null);
  const [pendingClear, setPendingClear] = useState<CacheCategory | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const modes: Array<{ id: DataMode; label: string }> = [
    { id: 'export', label: '导出设置' },
    { id: 'cache', label: '缓存管理' },
    { id: 'downloads', label: '平台连接' },
    { id: 'logs', label: '日志管理' },
  ];

  const refreshUsage = async () => setUsage(await getCacheUsage());
  const refreshLogs = async () => setLogs(await listLogs());

  useEffect(() => {
    let active = true;
    void Promise.all([getExportPreferences(), getCacheUsage(), listLogs()])
      .then(([nextExport, nextUsage, nextLogs]) => {
        if (!active) return;
        setExportPreferences(nextExport);
        setUsage(nextUsage);
        setLogs(nextLogs);
      })
      .catch((cause) => active && setError(errorMessage(cause, '无法读取数据管理设置。')));
    return () => { active = false; };
  }, []);

  const usageByCategory = useMemo(
    () => new Map(usage.categories.map((item) => [item.category, item])),
    [usage.categories],
  );

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setError(errorMessage(cause, '操作失败，请重试。'));
    } finally {
      setBusy(false);
    }
  };

  const saveExport = () => run(async () => {
    setExportPreferences(await saveExportPreferences(exportPreferences));
  }, '导出设置已保存。');

  const restoreExport = () => run(async () => {
    setExportPreferences(await restoreExportPreferences());
  }, '已恢复默认导出设置。');

  const confirmCacheClear = (category: CacheCategory) => run(async () => {
    await clearCache(category);
    setPendingClear(null);
    await refreshUsage();
  }, `${category === 'all' ? '全部缓存' : cacheLabels[category]}已清理。`);

  const changeLogLevel = (value: string) => {
    const next = value as LogLevel;
    setCurrentLogLevel(next);
    void run(async () => {
      setCurrentLogLevel(await setLogLevel(next));
    }, '日志级别已更新。');
  };

  const viewLog = (id: string) => run(async () => {
    setSelectedLog(await readLog(id, 64 * 1024));
  }, '日志尾部已载入。');

  return (
    <section className="settings-feature" aria-label="数据管理设置">
      <header className="settings-feature-header"><h2>数据管理</h2><p>管理导出、固定缓存、平台连接和诊断日志。</p></header>
      <div className="settings-segments" role="tablist" aria-label="数据管理类型">
        {modes.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>

      {mode === 'export' && (
        <div className="settings-stack" role="tabpanel">
          <article className="settings-surface">
            <div className="settings-card-heading"><div><h3>默认导出规则</h3><p>结果导出使用真实 Markdown、HTML 或纯文本序列化器。</p></div></div>
            <div className="settings-form-grid">
              <label className="settings-field"><span>默认导出格式</span><StyledSelect label="默认导出格式" value={exportPreferences.format} options={[
                { value: 'markdown', label: 'Markdown', description: '保留完整结构和标记' },
                { value: 'html', label: 'HTML', description: '可直接在浏览器中阅读' },
                { value: 'text', label: '纯文本', description: '去除 Markdown 标记' },
              ]} onChange={(format) => setExportPreferences((current) => ({ ...current, format: format as ExportPreferences['format'] }))} /></label>
            </div>
            <div className="settings-check-grid">
              <Toggle label="包含截图" checked={exportPreferences.includeScreenshots} onChange={(includeScreenshots) => setExportPreferences((current) => ({ ...current, includeScreenshots }))} />
              <Toggle label="包含字幕" checked={exportPreferences.includeSubtitles} onChange={(includeSubtitles) => setExportPreferences((current) => ({ ...current, includeSubtitles }))} />
              <Toggle label="包含来源信息" checked={exportPreferences.includeSourceMetadata} onChange={(includeSourceMetadata) => setExportPreferences((current) => ({ ...current, includeSourceMetadata }))} />
              <Toggle label="附加诊断日志" checked={exportPreferences.includeDiagnosticLog} onChange={(includeDiagnosticLog) => setExportPreferences((current) => ({ ...current, includeDiagnosticLog }))} />
            </div>
            <div className="settings-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void saveExport()}>保存导出设置</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void restoreExport()}>恢复默认</button><button type="button" className="secondary-action" onClick={() => void openExportDirectory()}>打开导出目录</button></div>
          </article>
          <OutputSettings />
        </div>
      )}

      {mode === 'cache' && (
        <div className="settings-stack" role="tabpanel">
          <article className="settings-surface">
            <div className="settings-card-heading"><div><h3>应用缓存</h3><p>只清理四个由应用注册的缓存目录，不会删除历史笔记、模型或运行时。</p></div><strong>{formatBytes(usage.totalBytes)}</strong></div>
            <div className="cache-usage-grid">
              {(Object.keys(cacheLabels) as Array<Exclude<CacheCategory, 'all'>>).map((category) => {
                const item = usageByCategory.get(category);
                return <article className="cache-usage-card" key={category}><div><strong>{cacheLabels[category]}</strong><span>{formatBytes(item?.bytes ?? 0)} · {item?.fileCount ?? 0} 个文件</span></div><button type="button" className="secondary-action" disabled={busy} onClick={() => setPendingClear(category)}>清理{cacheLabels[category]}</button></article>;
              })}
            </div>
            <div className="settings-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => void run(refreshUsage, '缓存大小已刷新。')}>刷新大小</button><button type="button" className="danger-action" disabled={busy} onClick={() => setPendingClear('all')}>清理全部缓存</button></div>
          </article>
          {pendingClear && <article className="settings-confirmation" role="alert"><div><strong>确认清理{pendingClear === 'all' ? '全部缓存' : cacheLabels[pendingClear]}？</strong><span>此操作不会影响笔记、模型和运行时文件。</span></div><div className="settings-actions"><button type="button" className="danger-action" onClick={() => void confirmCacheClear(pendingClear)}>确认清理{pendingClear === 'all' ? '全部缓存' : cacheLabels[pendingClear]}</button><button type="button" className="secondary-action" onClick={() => setPendingClear(null)}>取消</button></div></article>}
        </div>
      )}

      {mode === 'downloads' && <div role="tabpanel"><DownloadSettings /></div>}

      {mode === 'logs' && (
        <div className="settings-stack" role="tabpanel">
          <article className="settings-surface">
            <div className="settings-card-heading"><div><h3>运行日志</h3><p>按验证后的日志 ID 查看最多 64 KiB 尾部内容。</p></div></div>
            <label className="settings-field"><span>日志级别</span><StyledSelect label="日志级别" value={logLevel} options={logLevelOptions} onChange={changeLogLevel} /></label>
            <div className="log-file-list">{logs.length === 0 ? <p className="settings-empty">暂无日志文件。</p> : logs.map((log) => <button key={log.id} type="button" className="log-file-row" aria-label={`查看日志 ${log.name}`} onClick={() => void viewLog(log.id)}><span><strong>{log.name}</strong><small>{formatBytes(log.bytes)}{log.modifiedAt ? ` · ${new Date(log.modifiedAt).toLocaleString()}` : ''}</small></span><span>查看日志 {log.name}</span></button>)}</div>
            <div className="settings-actions"><button type="button" className="secondary-action" onClick={() => void openLogDirectory()}>打开日志目录</button><button type="button" className="secondary-action" onClick={() => void run(refreshLogs, '日志列表已刷新。')}>刷新日志</button><button type="button" className="danger-action" onClick={() => void run(async () => { await clearLogs(); setSelectedLog(null); await refreshLogs(); }, '日志已清理。')}>清理日志</button></div>
          </article>
          {selectedLog && <article className="settings-surface log-preview"><div className="settings-card-heading"><div><h3>{selectedLog.id}</h3><p>{selectedLog.truncated ? '仅显示最新 64 KiB' : '完整日志内容'}</p></div></div><pre>{selectedLog.content}</pre></article>}
        </div>
      )}

      {message && <div className="settings-status success" role="status">{message}</div>}
      {error && <div className="settings-status warning" role="alert">{error}</div>}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-toggle"><input type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><span><strong>{label}</strong></span></label>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) return String(cause.message);
  return fallback;
}
