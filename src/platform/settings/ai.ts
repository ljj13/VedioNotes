/**
 * AI 能力设置适配层——封装了到 bridge.ts 的调用.
 * 含服务商目录查询、配置保存/激活、凭据状态管理、能力设置读写.
 * 被 AiAccessTab 引用，不含 UI.
 */

import {
  getSummaryProviderCatalog,
  saveAndActivateCatalogSummaryProfile,
  saveSummaryProfile,
  deleteProfile,
  setActiveProfile,
  testProfile,
  discoverSummaryModels,
  hasProfileCredential,
  revealSummaryProfileCredential,
  getCapabilitySettings,
  getCapabilityStatus,
  saveVectorConfig,
  saveRerankConfig,
  saveWebSearchConfig,
  saveTtsConfig,
  saveImageConfig,
  saveLocalAgentConfig,
  testVectorConfig,
  testRerankConfig,
  testWebSearchConfig,
  testTtsConfig,
  testImageConfig,
  testLocalAgentConfig,
  detectLocalAgents,
} from '../../lib/bridge';

async function openExternal(url: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

export const aiPlatform = {
  getCatalog: getSummaryProviderCatalog,
  saveAndActivate: saveAndActivateCatalogSummaryProfile,
  saveProfile: saveSummaryProfile,
  deleteProfile,
  setActiveProfile,
  testProfile,
  discoverModels: discoverSummaryModels,
  hasCredential: hasProfileCredential,
  revealCredential: (profileType: string, profileId: string) => {
    if (profileType !== 'summary') {
      return Promise.reject(new Error('仅支持读取总结服务商凭据'));
    }
    return revealSummaryProfileCredential(profileId);
  },
  getCapabilitySettings,
  getCapabilityStatus,
  saveVector: saveVectorConfig,
  saveRerank: saveRerankConfig,
  saveWebSearch: saveWebSearchConfig,
  saveTts: saveTtsConfig,
  saveImage: saveImageConfig,
  saveLocalAgent: saveLocalAgentConfig,
  testVector: testVectorConfig,
  testRerank: testRerankConfig,
  testWebSearch: testWebSearchConfig,
  testTts: testTtsConfig,
  testImage: testImageConfig,
  testLocalAgent: testLocalAgentConfig,
  detectLocalAgents,
  openExternal,
} as const;
