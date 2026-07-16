import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SettingsWorkspace from '../../src/components/SettingsWorkspace';
import WorkbenchShell from '../../src/components/WorkbenchShell';
import type { SettingsSection, WorkbenchNavigationState } from '../../src/lib/workbenchNavigation';
import type { AppProfiles, LocalModelStatus } from '../../src/lib/types';
import '../../src/styles/app.css';

const query = new URLSearchParams(location.search);
const initialSection: SettingsSection = query.get('section') === 'ai' ? 'ai' : 'transcription';
document.documentElement.dataset.theme = 'light';
const profiles: AppProfiles = {
  schemaVersion: 1, activeTranscriptionProfileId: 'online-asr', activeSummaryProfileId: 'deepseek', fallbackTranscriptionProfileId: null, migrationRequired: false,
  transcriptionProfiles: [
    { id: 'local-whisper-cpp', name: '本地 Whisper', provider: 'local_whisper_cpp', baseUrl: '', model: 'small', enabled: true, builtIn: true },
    { id: 'online-asr', name: 'MiMo ASR', provider: 'mimo_asr', baseUrl: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-asr', enabled: true, builtIn: true },
    { id: 'custom-asr', name: '课程转写服务', provider: 'open_ai_compatible', baseUrl: 'https://asr.example.test/v1', model: 'whisper-large-v3', enabled: true, builtIn: false },
  ],
  summaryProfiles: [
    { id: 'deepseek', name: 'DeepSeek', provider: 'deep_seek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', enabled: true, builtIn: true },
    { id: 'custom-summary', name: '自定义总结', provider: 'open_ai_compatible', baseUrl: 'https://llm.example.test/v1', model: 'custom-note-model', enabled: true, builtIn: false },
  ],
};
const models: LocalModelStatus[] = ['tiny','base','small','medium','large-v3-turbo'].map((id) => ({ id, state: id === 'small' ? 'ready' : 'not_downloaded', downloadedBytes: id === 'small' ? 1 : 0, totalBytes: 1, isCurrent: id === 'small' }));

function Fixture(){
  const [section,setSection]=useState<SettingsSection>(initialSection);
  const navigation: WorkbenchNavigationState={view:'settings',settingsSection:section,returnView:'create',sidebarCollapsed:false};
  return <WorkbenchShell navigation={navigation} onNavigate={()=>{}} onToggleSidebar={()=>{}} serviceStatus={{ready:true,detail:'Whisper · CUDA 就绪'}} theme="light">
    <SettingsWorkspace section={section} profiles={profiles} localModels={models} theme="light" sidebarCollapsed={false} onSelectSection={setSection} onReturn={()=>{}} onProfilesChanged={()=>{}} onModelsChanged={()=>{}} onToggleTheme={()=>{}} onToggleSidebar={()=>{}} />
  </WorkbenchShell>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
