import { useEffect, useState } from 'react';
import { Card, Button } from '@heroui/react';
import { CircleExclamation, CircleCheck, TrashBin, FolderOpen, ArrowRotateLeft, Eye } from '@gravity-ui/icons';
import { settingsPlatform } from '../../../platform/settings';
import type {
  CacheUsage,
  CacheCategory,
  CacheClearResult,
  LogDescriptor,
  LogTail,
  ExportPreferences,
  ExportFormat,
} from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';

const CACHE_CATEGORIES: Array<{ value: Exclude<CacheCategory, 'all'>; label: string }> = [
  { value: 'temporary_media', label: '临时媒体' },
  { value: 'screenshots', label: '截图' },
  { value: 'transcription_intermediates', label: '转写中间文件' },
  { value: 'ai_index', label: 'AI 索引' },
];

const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'text', label: '纯文本' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function DataManagementTab(_props: SettingsEntryProps) {
  const [cacheUsage, setCacheUsage] = useState<CacheUsage | null>(null);
  const [logs, setLogs] = useState<LogDescriptor[]>([]);
  const [logTail, setLogTail] = useState<LogTail | null>(null);
  const [exportPrefs, setExportPrefs] = useState<ExportPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmClear, setConfirmClear] = useState<CacheCategory | null>(null);
  const [clearResult, setClearResult] = useState<CacheClearResult | null>(null);

  // Log state
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  // Export prefs dirty state
  const [exportDraft, setExportDraft] = useState<ExportPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    Promise.all([
      settingsPlatform.data.getCacheUsage(),
      settingsPlatform.data.listLogs(),
      settingsPlatform.data.getExportPreferences(),
    ]).then(([usage, logList, prefs]) => {
      setCacheUsage(usage);
      setLogs(logList);
      setExportPrefs(prefs);
      setExportDraft(prefs);
      setLoading(false);
    }).catch((e) => {
      setError(`加载数据失败: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    });
  }, []);

  const refreshCache = async () => {
    try {
      const usage = await settingsPlatform.data.getCacheUsage();
      setCacheUsage(usage);
    } catch (e) {
      setError(`刷新缓存统计失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleClearCache = async (category: CacheCategory) => {
    setError(null);
    setSuccess(null);
    setClearResult(null);
    try {
      const result = await settingsPlatform.data.clearCache(category);
      setClearResult(result);
      setConfirmClear(null);
      await refreshCache();
      setSuccess(`已清理 ${formatBytes(result.removedBytes)}，移除 ${result.removedFiles} 个文件`);
    } catch (e) {
      setError(`清理缓存失败: ${e instanceof Error ? e.message : String(e)}`);
      setConfirmClear(null);
    }
  };

  const handleReadLog = async (id: string) => {
    setLogLoading(true);
    setLogError(null);
    setSelectedLogId(id);
    try {
      const tail = await settingsPlatform.data.readLog(id, 65536);
      setLogTail(tail);
    } catch (e) {
      setLogError(`读取日志失败: ${e instanceof Error ? e.message : String(e)}`);
      setLogTail(null);
    } finally {
      setLogLoading(false);
    }
  };

  const handleSaveExportPrefs = async () => {
    if (!exportDraft) return;
    setSavingPrefs(true);
    setError(null);
    try {
      const saved = await settingsPlatform.data.saveExportPreferences(exportDraft);
      setExportPrefs(saved);
      setSuccess('导出偏好已保存');
    } catch (e) {
      setError(`保存导出偏好失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRestoreExportPrefs = async () => {
    try {
      const restored = await settingsPlatform.data.restoreExportPreferences();
      setExportPrefs(restored);
      setExportDraft(restored);
      setSuccess('导出偏好已恢复默认');
    } catch (e) {
      setError(`恢复默认失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (loading) return <div role="status">正在加载数据管理信息...</div>;

  return (
    <div className="cipher-data-tab">
      <header className="cipher-feature-header">
        <h2>数据管理</h2>
        <p>管理缓存、日志和导出设置。</p>
      </header>

      {error && <div role="alert" className="cipher-error-banner"><CircleExclamation width={16} /> {error}</div>}
      {success && <div role="status" className="cipher-success-banner"><CircleCheck width={16} /> {success}</div>}
      {clearResult && (
        <div className="cipher-clear-result">
          <strong>清理结果</strong>
          <span>移除 {clearResult.removedFiles} 个文件，{formatBytes(clearResult.removedBytes)}</span>
          {clearResult.preservedPaths.length > 0 && (
            <span>保留 {clearResult.preservedPaths.length} 个路径</span>
          )}
        </div>
      )}

      {/* Export Preferences */}
      <section className="cipher-data-section">
        <h3>导出设置</h3>
        {exportDraft && (
          <Card className="cipher-export-card">
            <div className="cipher-field-group">
              <label htmlFor="export-format-select">默认导出格式</label>
              <select
                id="export-format-select"
                className="cipher-select"
                value={exportDraft.format}
                onChange={(e) => setExportDraft({ ...exportDraft, format: e.target.value as ExportFormat })}
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="cipher-checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={exportDraft.includeScreenshots}
                  onChange={(e) => setExportDraft({ ...exportDraft, includeScreenshots: e.target.checked })}
                />
                包含截图
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={exportDraft.includeSubtitles}
                  onChange={(e) => setExportDraft({ ...exportDraft, includeSubtitles: e.target.checked })}
                />
                包含字幕
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={exportDraft.includeSourceMetadata}
                  onChange={(e) => setExportDraft({ ...exportDraft, includeSourceMetadata: e.target.checked })}
                />
                包含来源元数据
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={exportDraft.includeDiagnosticLog}
                  onChange={(e) => setExportDraft({ ...exportDraft, includeDiagnosticLog: e.target.checked })}
                />
                包含诊断日志
              </label>
            </div>
            <div className="cipher-model-actions">
              <Button variant="primary" onClick={handleSaveExportPrefs} isDisabled={savingPrefs || JSON.stringify(exportDraft) === JSON.stringify(exportPrefs)}>
                {savingPrefs ? '保存中…' : '保存导出偏好'}
              </Button>
              <Button variant="ghost" onClick={handleRestoreExportPrefs}><ArrowRotateLeft width={14} />恢复默认</Button>
              <Button variant="ghost" onClick={() => settingsPlatform.data.openExportDirectory()}><FolderOpen width={14} />打开导出目录</Button>
            </div>
          </Card>
        )}
      </section>

      {/* Cache Management */}
      <section className="cipher-data-section">
        <h3>缓存管理</h3>
        {cacheUsage && (
          <Card className="cipher-cache-card">
            <div className="cipher-cache-total">
              <strong>总占用：{formatBytes(cacheUsage.totalBytes)}</strong>
              <Button size="sm" variant="ghost" onClick={refreshCache}><ArrowRotateLeft width={14} />刷新</Button>
            </div>
            <div className="cipher-cache-list">
              {cacheUsage.categories.map((item) => {
                const cat = CACHE_CATEGORIES.find((c) => c.value === item.category);
                return (
                  <div key={item.category} className="cipher-cache-item">
                    <span className="cipher-cache-label">{cat?.label ?? item.category}</span>
                    <span className="cipher-cache-size">{formatBytes(item.bytes)}（{item.fileCount} 个文件）</span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmClear(item.category)}
                    >
                      <TrashBin width={14} />清理
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="cipher-cache-clear-all">
              <Button variant="danger" onClick={() => setConfirmClear('all')}>
                <TrashBin width={14} />清理全部缓存
              </Button>
            </div>
          </Card>
        )}
      </section>

      {/* Log Management */}
      <section className="cipher-data-section">
        <h3>日志管理</h3>
        <div className="cipher-log-list">
          {logs.length === 0 && <p className="cipher-empty-state">暂无日志文件。</p>}
          {logs.map((log) => (
            <div key={log.id} className={`cipher-log-item ${selectedLogId === log.id ? 'selected' : ''}`}>
              <span className="cipher-log-name">{log.name}</span>
              <span className="cipher-log-size">{formatBytes(log.bytes)}</span>
              {log.modifiedAt && <span className="cipher-log-date">{log.modifiedAt}</span>}
              <Button size="sm" variant="ghost" onClick={() => handleReadLog(log.id)}>
                <Eye width={14} />查看
              </Button>
            </div>
          ))}
        </div>

        {logLoading && <div role="status">正在读取日志...</div>}
        {logError && <div role="alert" className="cipher-error-banner"><CircleExclamation width={16} /> {logError}</div>}

        {logTail && (
          <div className="cipher-log-tail">
            <h4>{logTail.id}</h4>
            {logTail.truncated && <div className="cipher-log-truncated">日志已截断，仅显示末尾内容</div>}
            <pre className="cipher-log-content">{logTail.content}</pre>
          </div>
        )}

        <div className="cipher-model-actions">
          <Button variant="ghost" onClick={() => settingsPlatform.data.openLogDirectory()}>
            <FolderOpen width={14} />打开日志目录
          </Button>
        </div>
      </section>

      {/* Confirm Clear Dialog */}
      {confirmClear && (
        <div className="cipher-confirm-overlay" role="alertdialog" aria-label="确认清理缓存">
          <div className="cipher-confirm-dialog">
            <h3>确认清理</h3>
            <p>
              确定要清理
              {confirmClear === 'all' ? '全部缓存' : CACHE_CATEGORIES.find((c) => c.value === confirmClear)?.label ?? confirmClear}
              吗？此操作不可撤销。
            </p>
            <div className="cipher-confirm-actions">
              <Button variant="danger" onClick={() => handleClearCache(confirmClear)}>确认清理</Button>
              <Button variant="ghost" onClick={() => setConfirmClear(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
