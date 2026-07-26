/**
 *下载设置组件——管理各视频平台的下载 Cookie。
 */

import { useEffect, useState } from 'react';
import { deleteDownloadCookie, getDownloadCookieStatus, saveDownloadCookie } from '../lib/bridge';
import type { DownloadCookieStatus, DownloadPlatform } from '../lib/types';

const platforms: Array<[DownloadPlatform, string]> = [['bilibili', 'B站'], ['douyin', '抖音'], ['youtube', 'YouTube']];

/** DownloadSettings */
export default function DownloadSettings() {
  const [status, setStatus] = useState<DownloadCookieStatus | null>(null);
  const [values, setValues] = useState<Record<DownloadPlatform, string>>({ bilibili: '', douyin: '', youtube: '' });
  const [busy, setBusy] = useState<DownloadPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => getDownloadCookieStatus().then(setStatus).catch(() => setError('无法读取 Cookie 配置状态，请重试。'));
  useEffect(() => { void reload(); }, []);
  const save = async (platform: DownloadPlatform) => {
    setBusy(platform); setError(null);
    try { await saveDownloadCookie(platform, values[platform]); setValues((old) => ({ ...old, [platform]: '' })); reload(); }
    catch { setError('保存失败，请检查 Cookie 格式后重试。'); }
    finally { setBusy(null); }
  };
  const remove = async (platform: DownloadPlatform) => {
    setBusy(platform); setError(null);
    try { await deleteDownloadCookie(platform); reload(); }
    catch { setError('删除失败，请重试。'); }
    finally { setBusy(null); }
  };
  return <section className="download-settings" aria-label="下载配置">
    <h3>下载配置</h3><p>Cookie 可选，仅用于访问需要登录的平台内容；保存后不会再次显示。</p>
    {error && <p className="output-error" role="alert">{error}</p>}
    <div className="download-cookie-list">{platforms.map(([platform, label]) => <article className="download-cookie-card" key={platform}>
      <div><strong>{label} Cookie</strong><span className={status?.[platform] ? 'cookie-ready' : 'cookie-empty'}>{status?.[platform] ? '已配置' : '未配置'}</span></div>
      <input aria-label={`${label} Cookie`} className="settings-input" type="password" value={values[platform]} placeholder="粘贴后可替换已有 Cookie" onChange={(event) => setValues((old) => ({ ...old, [platform]: event.target.value }))} />
      <div className="output-settings-actions"><button type="button" disabled={busy === platform || !values[platform].trim()} onClick={() => save(platform)}>保存 {label} Cookie</button>{status?.[platform] && <button type="button" disabled={busy === platform} onClick={() => remove(platform)}>删除</button>}</div>
    </article>)}</div>
  </section>;
}
