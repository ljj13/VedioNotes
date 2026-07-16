import { useEffect, useState } from 'react';
import { Card, Button } from '@heroui/react';
import { settingsPlatform } from '../../../platform/settings';
import type { CacheUsage, LogDescriptor, LogTail } from '../../../lib/types';
import type { SettingsEntryProps } from '../settingsTypes';

export default function DataManagementTab(_props: SettingsEntryProps) {
  const [cacheUsage, setCacheUsage] = useState<CacheUsage | null>(null);
  const [logs, setLogs] = useState<LogDescriptor[]>([]);
  const [logTail, setLogTail] = useState<LogTail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      settingsPlatform.data.getCacheUsage(),
      settingsPlatform.data.listLogs(),
    ]).then(([usage, logList]) => {
      setCacheUsage(usage);
      setLogs(logList);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleClearCache = async () => {
    await settingsPlatform.data.clearCache('all');
    const usage = await settingsPlatform.data.getCacheUsage();
    setCacheUsage(usage);
  };

  const handleReadLog = async (id: string) => {
    const tail = await settingsPlatform.data.readLog(id, 65536);
    setLogTail(tail);
  };

  if (loading) return <div role="status">正在加载数据管理信息...</div>;

  return (
    <div className="cipher-data-tab">
      <header className="cipher-feature-header">
        <h2>数据管理</h2>
        <p>管理缓存、日志和导出设置。</p>
      </header>

      <section className="cipher-data-section">
        <h3>缓存</h3>
        {cacheUsage && (
          <Card className="cipher-cache-card">
            {cacheUsage.categories?.map((item) => (
              <div key={item.category}>
                <span>{item.category}</span>
                <span>{Math.round(item.bytes / 1024)} KB</span>
              </div>
            ))}
            <Button variant="danger" onClick={handleClearCache}>清除全部缓存</Button>
          </Card>
        )}
      </section>

      <section className="cipher-data-section">
        <h3>日志</h3>
        <div className="cipher-log-list">
          {logs.map((log) => (
            <div key={log.id} className="cipher-log-item">
              <span>{log.name}</span>
              <Button size="sm" variant="ghost" onClick={() => handleReadLog(log.id)}>查看</Button>
            </div>
          ))}
        </div>
        {logTail && (
          <div className="cipher-log-tail">
            <h4>{logTail.id}</h4>
            <pre>{logTail.content}</pre>
          </div>
        )}
      </section>

      <section className="cipher-data-section">
        <h3>导出</h3>
        <div>
          <Button variant="ghost" onClick={() => settingsPlatform.data.openExportDirectory()}>打开导出目录</Button>
        </div>
      </section>
    </div>
  );
}
