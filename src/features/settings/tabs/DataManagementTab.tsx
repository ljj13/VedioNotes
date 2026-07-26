/**
 *数据管理设置页——导出偏好、Markdown输出目录、缓存清理和日志查看。
 */

import { useEffect, useState } from 'react';
import { AlertDialog, Button, Card, Label, ListBox, Select, Tabs, type Key } from '@heroui/react';
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
  AppPreferences,
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

/** DataManagementTab */
export default function DataManagementTab(_props: SettingsEntryProps) {
  const [cacheUsage, setCacheUsage] = useState<CacheUsage | null>(null);
  const [logs, setLogs] = useState<LogDescriptor[]>([]);
  const [logTail, setLogTail] = useState<LogTail | null>(null);
  const [exportPrefs, setExportPrefs] = useState<ExportPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'export' | 'cache' | 'logs'>('export');

  // Confirm dialog state
  const [confirmClear, setConfirmClear] = useState<CacheCategory | null>(null);
  const [clearResult, setClearResult] = useState<CacheClearResult | null>(null);

  // Log state
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  // Export prefs dirty state
  const [exportDraft, setExportDraft] = useState<ExportPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Markdown output directory state
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [dirPending, setDirPending] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);
  const [dirStatus, setDirStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      settingsPlatform.data.getCacheUsage(),
      settingsPlatform.data.listLogs(),
      settingsPlatform.data.getExportPreferences(),
      settingsPlatform.data.getPreferences(),
    ]).then(([usage, logList, prefs, appPrefs]) => {
      setCacheUsage(usage);
      setLogs(logList);
      setExportPrefs(prefs);
      setExportDraft(prefs);
      setPreferences(appPrefs);
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

  const handleChooseMarkdownDir = async () => {
    setDirPending(true);
    setDirError(null);
    setDirStatus(null);
    try {
      const selectedPath = await settingsPlatform.data.chooseExportDirectory();
      if (!selectedPath) return;
      const updated = await settingsPlatform.data.setMarkdownOutputDir(selectedPath);
      setPreferences(updated);
      setDirStatus('Markdown 输出目录已更新');
    } catch (e) {
      setDirError(`选择目录失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDirPending(false);
    }
  };

  const handleRestoreDefaultMarkdownDir = async () => {
    setDirPending(true);
    setDirError(null);
    setDirStatus(null);
    try {
      const updated = await settingsPlatform.data.setMarkdownOutputDir(null);
      setPreferences(updated);
      setDirStatus('已恢复系统默认 Markdown 输出目录');
    } catch (e) {
      setDirError(`恢复默认失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDirPending(false);
    }
  };

  if (loading) return <div role="status">正在加载数据管理信息...</div>;

  return (
    <div className="tab-content space-y-6">
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">数据管理</h2>
        <p className="text-sm text-muted">管理 VedioNotes 的导出位置、应用缓存和诊断日志。</p>
      </section>
      <Tabs selectedKey={activePanel} onSelectionChange={(key: Key) => setActivePanel(String(key) as 'export' | 'cache' | 'logs')} className="w-full">
        <Tabs.ListContainer>
          <Tabs.List aria-label="数据管理分类" className="w-full *:flex-1">
            <Tabs.Tab id="export"><FolderOpen width={16} />导出设置<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="cache"><TrashBin width={16} />缓存管理<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="logs"><Eye width={16} />日志管理<Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

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
      <section className="space-y-5" hidden={activePanel !== 'export'}>
        <h3 className="sr-only">导出设置</h3>
        {exportDraft && (
          <Card className="cipher-export-card">
              <Select className="cipher-settings-select" selectedKey={exportDraft.format} onSelectionChange={(key) => { if (key != null) setExportDraft({ ...exportDraft, format: String(key) as ExportFormat }); }} variant="secondary" fullWidth>
                <Label className="cipher-settings-select-label">默认导出格式</Label>
                <Select.Trigger className="cipher-settings-select-trigger"><Select.Value className="cipher-settings-select-value">{EXPORT_FORMATS.find((item) => item.value === exportDraft.format)?.label}</Select.Value><Select.Indicator className="cipher-settings-select-indicator" /></Select.Trigger>
                <Select.Popover className="cipher-settings-select-popover"><ListBox className="cipher-settings-select-listbox">{EXPORT_FORMATS.map((item) => <ListBox.Item className="cipher-settings-select-option" key={item.value} id={item.value} textValue={item.label}>{item.label}<ListBox.ItemIndicator className="cipher-settings-select-option-indicator" /></ListBox.Item>)}</ListBox></Select.Popover>
            </Select>
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

      {/* Markdown Output Directory */}
      <section className="space-y-5" hidden={activePanel !== 'export'}>
        <h3 className="text-lg font-semibold">Markdown 输出目录</h3>
        <Card className="cipher-export-card">
          <div className="cipher-field-group">
            <label htmlFor="markdown-dir-display">当前输出目录</label>
            <code id="markdown-dir-display" className="cipher-path-value">
              {preferences
                ? preferences.markdownOutputDir || '系统默认：视频\\VedioNotes'
                : '正在读取...'}
            </code>
          </div>
          {dirError && <div role="alert" className="cipher-error-banner"><CircleExclamation width={16} /> {dirError}</div>}
          {dirStatus && <div role="status" className="cipher-success-banner"><CircleCheck width={16} /> {dirStatus}</div>}
          <div className="cipher-model-actions">
            <Button variant="primary" onClick={handleChooseMarkdownDir} isDisabled={dirPending}>
              {dirPending ? '选择中…' : '选择目录'}
            </Button>
            <Button variant="ghost" onClick={handleRestoreDefaultMarkdownDir} isDisabled={dirPending}>
              <ArrowRotateLeft width={14} />恢复默认
            </Button>
          </div>
        </Card>
      </section>

      {/* Cache Management */}
      <section className="space-y-5" hidden={activePanel !== 'cache'}>
        <h3 className="sr-only">缓存管理</h3>
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
      <section className="space-y-5" hidden={activePanel !== 'logs'}>
        <h3 className="sr-only">日志管理</h3>
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
      <AlertDialog isOpen={confirmClear !== null} onOpenChange={(open) => { if (!open) setConfirmClear(null); }}>
        <Button className="hidden" aria-hidden="true">打开确认框</Button>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-105">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header><AlertDialog.Icon status="danger" /><AlertDialog.Heading>确认清理</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body>确定要清理{confirmClear === 'all' ? '全部缓存' : CACHE_CATEGORIES.find((c) => c.value === confirmClear)?.label ?? confirmClear}吗？此操作不可撤销。</AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" onPress={() => setConfirmClear(null)}>取消</Button>
                <Button slot="close" variant="danger" onPress={() => { if (confirmClear) void handleClearCache(confirmClear); }}>确认清理</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
