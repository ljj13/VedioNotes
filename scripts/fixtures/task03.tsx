import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkbenchShell from '../../src/components/WorkbenchShell';
import ProgressWorkspace, { BackgroundTaskPill } from '../../src/components/ProgressWorkspace';
import ResultWorkspace from '../../src/components/ResultWorkspace';
import type { WorkbenchNavigationState } from '../../src/lib/workbenchNavigation';
import '../../src/styles/app.css';

const params = new URLSearchParams(window.location.search);
const view = params.get('view') ?? 'progress';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = theme;

const navigation: WorkbenchNavigationState = {
  view: view === 'result' ? 'result' : 'progress',
  settingsSection: 'transcription',
  returnView: 'create',
  sidebarCollapsed: false,
};

const distillation = {
  core_conclusion: '视频阐明了公开信息整理的核心方法：先保留可追溯证据，再生成结构化结论。',
  key_evidence: [
    { text: '平台字幕可用时优先使用原始字幕，避免不必要的重复转写。', timestamp_seconds: 32 },
    { text: '缺少字幕时，本地 CUDA 转写能够在保护数据隐私的同时提升处理速度。', timestamp_seconds: 95 },
    { text: '最终笔记同时保存结论、证据、行动建议和完整转写，便于后续检索。' },
  ],
  implications: ['重要结论必须能回到原视频时间点核对。', '长任务应允许后台运行，并持续显示真实进度和已用时间。'],
  transcript: '这是用于视觉核对的完整转写节选。正文区域保持稳定可读，并可通过文章目录快速定位。',
};

function Fixture() {
  const content = view === 'result' ? (
    <ResultWorkspace
      distillation={distillation}
      savedPath="D:\\Project\\notes\\export\\示例视频-核心提炼.md"
      transcriptionService="本地 Whisper · CUDA"
      summaryService="DeepSeek · deepseek-v4-flash"
      onSavedPathChanged={() => {}}
      onOpenLibrary={() => {}}
      onNewTask={() => {}}
      onCopy={() => {}}
    />
  ) : (
    <>
      <ProgressWorkspace
        progress={{ stage: 'transcribing', message: '正在使用 CUDA 转写音频…', percent: 68 }}
        startedAtMs={Date.now() - 201_000}
        sourceLabel="Bilibili 公开链接"
        serviceDetail="本地 Whisper Small · CUDA / DeepSeek · V4"
        onCancel={() => {}}
        onBackground={() => {}}
        onOpenLog={() => {}}
      />
      {view === 'background' && (
        <BackgroundTaskPill
          progress={{ stage: 'transcribing', message: '正在使用 CUDA 转写音频…', percent: 68 }}
          startedAtMs={Date.now() - 201_000}
          onOpen={() => {}}
        />
      )}
    </>
  );

  return (
    <WorkbenchShell
      navigation={navigation}
      onNavigate={() => {}}
      onToggleSidebar={() => {}}
      serviceStatus={{ ready: true, detail: 'Whisper · CUDA 就绪' }}
      theme={theme}
    >
      {content}
    </WorkbenchShell>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
