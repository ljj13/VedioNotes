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

export const aiPlatform = {
  getCatalog: getSummaryProviderCatalog,
  saveAndActivate: saveAndActivateCatalogSummaryProfile,
  saveProfile: saveSummaryProfile,
  deleteProfile,
  setActiveProfile,
  testProfile,
  discoverModels: discoverSummaryModels,
  hasCredential: hasProfileCredential,
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
} as const;
