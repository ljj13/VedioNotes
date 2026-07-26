/**
 * 转写设置适配层——封装 SenseVoice/Whisper/CUDA 操作.
 * 含模型下载/删除/激活、运行时管理、语言选择.
 * 被 TranscriptionTab 引用.
 */

import {
  deleteLocalModel,
  downloadLocalModel,
  getCudaRuntimeStatus,
  getSenseVoiceStatus,
  listLocalModels,
  downloadCudaRuntime,
  deleteCudaRuntime,
  downloadSenseVoice,
  cancelSenseVoiceDownload,
  deleteSenseVoice,
  setSenseVoiceModel,
  setLocalComputeMode,
  onLocalModelDownloadProgress,
  onSenseVoiceDownloadProgress,
  onCudaRuntimeDownloadProgress,
  saveTranscriptionProfile,
  deleteProfile,
  setActiveProfile,
  setFallbackTranscriptionProfile,
  testProfile,
  hasProfileCredential,
} from '../../lib/bridge';
import { attachLateSafeListener } from './events';

export const transcriptionPlatform = {
  listLocalModels,
  downloadLocalModel,
  deleteLocalModel,
  getCudaRuntimeStatus,
  downloadCudaRuntime,
  deleteCudaRuntime,
  setLocalComputeMode,
  getSenseVoiceStatus,
  downloadSenseVoice,
  cancelSenseVoiceDownload,
  deleteSenseVoice,
  setSenseVoiceModel,
  saveTranscriptionProfile,
  deleteProfile,
  setActiveProfile,
  setFallbackTranscriptionProfile,
  testProfile,
  hasProfileCredential,
  onLocalModelDownloadProgress,
  onSenseVoiceDownloadProgress,
  onCudaRuntimeDownloadProgress,
  attachLateSafeListener,
} as const;
