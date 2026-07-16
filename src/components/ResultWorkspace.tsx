import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { CapabilityStatus, Distillation } from '../lib/types';
import { generateNoteImage, getCapabilityStatus, synthesizeSpeech } from '../lib/bridge';
import ResultPanel from './ResultPanel';

type Props = {
  distillation: Distillation;
  savedPath: string | null;
  transcriptionService: string;
  summaryService: string;
  onSavedPathChanged: (path: string) => void;
  onOpenLibrary: () => void;
  onNewTask: () => void;
  onCopy?: (content: string) => Promise<void> | void;
};

export default function ResultWorkspace({
  distillation,
  savedPath,
  transcriptionService,
  summaryService,
  onSavedPathChanged,
  onOpenLibrary,
  onNewTask,
  onCopy,
}: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [capabilityStatus, setCapabilityStatus] = useState<CapabilityStatus | null>(null);
  const [capabilityChecked, setCapabilityChecked] = useState(false);
  const [capabilityBusy, setCapabilityBusy] = useState<'tts' | 'image' | null>(null);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const sections = [
    { id: 'result-conclusion', label: '核心结论' },
    { id: 'result-evidence', label: '关键依据' },
    { id: 'result-actions', label: '启示/行动' },
    ...(distillation.transcript ? [{ id: 'result-transcript', label: '完整转写' }] : []),
  ];
  const markdown = serializeDistillation(distillation);

  useEffect(() => {
    if (!metadataOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMetadataOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [metadataOpen]);

  useEffect(() => {
    let active = true;
    void getCapabilityStatus()
      .then((next) => { if (active) setCapabilityStatus(next); })
      .catch(() => { if (active) setCapabilityStatus(null); })
      .finally(() => { if (active) setCapabilityChecked(true); });
    return () => { active = false; };
  }, []);

  const handleCopy = async () => {
    setCopyState('idle');
    try {
      if (onCopy) await onCopy(markdown);
      else await navigator.clipboard.writeText(markdown);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  const readAloud = async () => {
    if (capabilityBusy) return;
    setCapabilityBusy('tts'); setCapabilityMessage(null);
    try { const path = await synthesizeSpeech(markdown); setAudioUrl(convertFileSrc(path)); setCapabilityMessage('朗读文件已生成'); }
    catch { setCapabilityMessage('朗读生成失败，请检查语音服务配置。'); }
    finally { setCapabilityBusy(null); }
  };

  const createCover = async () => {
    if (capabilityBusy) return;
    setCapabilityBusy('image'); setCapabilityMessage(null);
    try { const path = await generateNoteImage(`为下面的视频笔记生成简洁、清晰的封面：${distillation.core_conclusion}`); setCoverUrl(convertFileSrc(path)); setCapabilityMessage('笔记封面已生成'); }
    catch { setCapabilityMessage('封面生成失败，请检查作图服务配置。'); }
    finally { setCapabilityBusy(null); }
  };

  const ttsReady = Boolean(capabilityStatus?.tts.enabled && capabilityStatus.tts.configured && capabilityStatus.tts.credentialReady);
  const imageReady = Boolean(capabilityStatus?.image.enabled && capabilityStatus.image.configured && capabilityStatus.image.credentialReady);

  return (
    <section className="result-workspace" aria-labelledby="result-workspace-title">
      <header className="result-workspace-header">
        <div>
          <span className="workspace-eyebrow">RESULT</span>
          <h1 id="result-workspace-title">提炼结果</h1>
          <p>结构化笔记已经生成并写入本地工作区。</p>
        </div>
        <div className="result-workspace-actions">
          <button type="button" className="secondary-action" onClick={handleCopy}>{copyState === 'copied' ? '已复制' : '复制全文'}</button>
          {capabilityChecked && <button type="button" className="secondary-action" disabled={!ttsReady || capabilityBusy !== null} title={ttsReady ? '使用已配置的语音服务生成朗读' : '请先在 AI 接入中启用并配置语音服务'} onClick={() => void readAloud()}>{capabilityBusy === 'tts' ? '生成中…' : '朗读当前笔记'}</button>}
          {capabilityChecked && <button type="button" className="secondary-action" disabled={!imageReady || capabilityBusy !== null} title={imageReady ? '使用已配置的作图服务生成封面' : '请先在 AI 接入中启用并配置作图服务'} onClick={() => void createCover()}>{capabilityBusy === 'image' ? '生成中…' : '生成笔记封面'}</button>}
          <button type="button" className="secondary-action result-metadata-trigger" aria-expanded={metadataOpen} aria-controls="result-metadata-drawer" onClick={() => setMetadataOpen(true)}>查看结果信息</button>
          <button type="button" className="primary-action" onClick={onOpenLibrary}>打开笔记库</button>
        </div>
        {copyState === 'error' && <span className="copy-result-error" role="alert">无法写入剪贴板，请重试。</span>}
        {capabilityMessage && <span className="result-capability-message" role="status">{capabilityMessage}</span>}
      </header>

      {(audioUrl || coverUrl) && <section className="result-generated-assets" aria-label="生成的笔记资源">
        {audioUrl && <audio controls aria-label="当前笔记朗读" src={audioUrl} />}
        {coverUrl && <img src={coverUrl} alt="生成的笔记封面" />}
      </section>}

      <div className="result-workspace-layout">
        <nav className="result-toc" aria-label="文章目录">
          <span className="workspace-eyebrow">CONTENTS</span>
          <h2>文章目录</h2>
          {sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}
        </nav>
        <article className="result-reading-pane" aria-label="提炼笔记正文">
          <ResultPanel distillation={distillation} savedPath={savedPath} onSavedPathChanged={onSavedPathChanged} />
        </article>
        <button type="button" className={`result-metadata-scrim ${metadataOpen ? 'is-open' : ''}`} aria-label="关闭结果信息抽屉" onClick={() => setMetadataOpen(false)} />
        <aside
          id="result-metadata-drawer"
          className={`result-metadata ${metadataOpen ? 'is-open' : ''}`}
          aria-label={metadataOpen ? '结果信息抽屉' : '结果信息'}
          role={metadataOpen ? 'dialog' : undefined}
          aria-modal={metadataOpen ? true : undefined}
        >
          <button type="button" className="result-metadata-close" aria-label="关闭结果信息" onClick={() => setMetadataOpen(false)}><CloseIcon /></button>
          <span className="workspace-eyebrow">DETAILS</span>
          <h2>结果信息</h2>
          <dl>
            <div><dt>转写服务</dt><dd>{transcriptionService}</dd></div>
            <div><dt>总结服务</dt><dd>{summaryService}</dd></div>
            <div><dt>关键依据</dt><dd>{distillation.key_evidence.length} 条</dd></div>
            <div><dt>本地文件</dt><dd>{savedPath ? '已保存' : '待保存'}</dd></div>
          </dl>
          <button type="button" className="secondary-action result-new-task" onClick={onNewTask}>提炼新视频</button>
        </aside>
      </div>
    </section>
  );
}

export function serializeDistillation(distillation: Distillation) {
  const evidence = distillation.key_evidence.map((item) => `- ${item.text}`).join('\n');
  const actions = distillation.implications.map((item) => `- ${item}`).join('\n');
  return [
    '# 核心结论',
    distillation.core_conclusion,
    '## 关键依据',
    evidence,
    '## 启示/行动',
    actions,
    ...(distillation.transcript ? ['## 完整转写', distillation.transcript] : []),
  ].join('\n\n');
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
