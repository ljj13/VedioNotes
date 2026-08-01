import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const productionVisual = readFileSync('production-workbench.visual.test.mjs', 'utf8');
const settingsVisual = readFileSync('task13-settings-visual-matrix.mjs', 'utf8');
const settingsCss = readFileSync('src/styles/cipher-settings.css', 'utf8');
const onlineTranscription = readFileSync('src/features/settings/components/OnlineTranscriptionSettings.tsx', 'utf8');
const dataManagement = readFileSync('src/features/settings/tabs/DataManagementTab.tsx', 'utf8');

function extractFunction(source, name, nextName) {
  const pattern = new RegExp(`async function ${name}[\\s\\S]*?\\n}\\n\\nasync function ${nextName}`);
  return source.match(pattern)?.[0] ?? '';
}

test('production visual gate targets the current Cipher settings DOM', () => {
  assert.match(productionVisual, /settings:\s*'\.cipher-settings-root'/);
  assert.match(productionVisual, /\.settings-tabs \[role="tab"\]/);
  assert.match(productionVisual, /\.settings-navigation-tabs/);
  assert.doesNotMatch(productionVisual, /'\.settings-navigation-rail'/);
  assert.match(productionVisual, /aria-label="语音转文字模式"/);
  assert.match(productionVisual, /aria-label="AI 能力"/);
  assert.match(productionVisual, /aria-label="数据管理分类"/);
  assert.match(productionVisual, /CPU 模式/);
  assert.match(productionVisual, /GPU 模式/);
  assert.match(productionVisual, /大语言模型/);
  assert.doesNotMatch(productionVisual, /\.cipher-settings-tabs/);
  assert.doesNotMatch(productionVisual, /\.settings-tabs-v2/);
});

test('settings visual gate verifies Button variants and the persisted GPU switch', () => {
  assert.match(productionVisual, /settingsButtons/);
  assert.match(productionVisual, /button--primary/);
  assert.match(productionVisual, /button--danger/);
  assert.match(productionVisual, /button--secondary/);
  assert.match(productionVisual, /button--outline/);
  assert.match(productionVisual, /--button-bg-hover/);
  assert.match(productionVisual, /icon must follow currentColor/);
  assert.match(productionVisual, /gpuAccelerationSwitch/);
  assert.match(productionVisual, /controlWidth: '42px'/);
  assert.match(productionVisual, /thumbWidth: '18px'/);
});

test('production visual gate distinguishes removed legacy controls and opens current HeroUI selects', () => {
  assert.match(productionVisual, /legacyOnlyModes/);
  assert.match(productionVisual, /legacyOnlySelectors/);
  assert.match(productionVisual, /legacyControlMatches/);
  assert.match(productionVisual, /physically absent, not merely closed/);
  assert.match(productionVisual, /settings-data-downloads/);
  assert.match(productionVisual, /settings-ai-agent-provider-dropdown/);
  assert.match(productionVisual, /data-slot="select-trigger"/);
  assert.match(productionVisual, /默认导出格式/);
  assert.match(productionVisual, /服务商/);
  assert.match(productionVisual, /模型/);
});

test('production visual gate proves removed sidebar modules are absent at runtime', () => {
  assert.match(productionVisual, /removedSidebarContainers/);
  assert.match(productionVisual, /\.sidebar-brand/);
  assert.match(productionVisual, /\.workspace-profile/);
  assert.match(productionVisual, /removedSidebarTextMatches/);
  assert.match(productionVisual, /本地工作区/);
  assert.match(productionVisual, /隐私模式/);
});

test('production route visuals use populated current contracts and geometry selectors', () => {
  assert.match(productionVisual, /get_summary_provider_catalog/);
  assert.match(productionVisual, /search_library/);
  assert.match(productionVisual, /get_history_markdown/);
  assert.match(productionVisual, /mark_note_opened/);
  assert.match(productionVisual, /list_task_records/);
  assert.match(productionVisual, /routeHeadings/);
  for (const selector of [
    '.window-top-bar', '.home-hero', '.create-workspace-main', '.library-layout',
    '.qa-layout', '.task-history-layout', '.settings-shell-layout', '.settings-body',
  ]) assert.match(productionVisual, new RegExp(selector.replaceAll('.', '\\.'), 'u'));
});

test('production visual gate checks chat/history geometry and critical control contrast', () => {
  assert.match(productionVisual, /libraryWithChat/);
  assert.match(productionVisual, /1280/);
  assert.match(productionVisual, /\.note-chat-drawer/);
  assert.match(productionVisual, /\.task-history-layout/);
  assert.match(productionVisual, /contrastRatio/);
  assert.match(productionVisual, /\.sidebar-create-action/);
  assert.match(productionVisual, /\.start-button/);
  assert.match(productionVisual, /form\[aria-label="提问编辑器"\]/);
  assert.match(productionVisual, /设置分类导航/);
  assert.match(productionVisual, /侧栏当前项/);
  assert.match(productionVisual, /contrastAudits\.length, 12/);
  assert.match(productionVisual, />= 4\.5|>=4\.5/);
});

test('production visual gate permits only approved inner-scrolling regions', () => {
  assert.match(productionVisual, /selector === '\.task-table-shell'\s*\|\|\s*selector === '\.settings-navigation-tabs'/);
  assert.match(productionVisual, /item\.intentionallyScrollable\s*\|\|\s*item\.scrollWidth <= item\.clientWidth/);
});

test('production visual gate collects all twelve contrast probes before failing the gate', () => {
  assert.match(productionVisual, /contrastAudits\.length,\s*12/);
  assert.match(productionVisual, /failedContrastAudits/);
  assert.match(productionVisual, /document\.getAnimations\(\)/);
  assert.doesNotMatch(productionVisual, /assert\.ok\(probe\.ratio >= 4\.5/);
});

test('production contrast probe parses modern computed CSS color formats', () => {
  assert.match(productionVisual, /oklch/);
  assert.match(productionVisual, /color\(srgb/);
});

test('settings visual gate mocks the current Rust bridge contracts', () => {
  assert.match(settingsVisual, /get_sensevoice_status/);
  assert.match(settingsVisual, /download_sensevoice/);
  assert.match(settingsVisual, /cancel_sensevoice_download/);
  assert.match(settingsVisual, /delete_sensevoice/);
  assert.match(settingsVisual, /set_sensevoice_model/);
  assert.doesNotMatch(settingsVisual, /get_sense_voice_status/);
  assert.doesNotMatch(settingsVisual, /download_sense_voice/);
  assert.match(settingsVisual, /tokensReady:\s*true/);
  assert.match(settingsVisual, /computeMode:\s*'auto'/);
  assert.match(settingsVisual, /license:\s*'MIT'/);
});

test('settings visual gate captures two Selects plus the model ComboBox and checks both overflow roots', () => {
  assert.match(settingsVisual, /function openHeroSelect/);
  assert.match(settingsVisual, /label:\s*'默认导出格式'/);
  assert.match(settingsVisual, /label:\s*'服务商'/);
  assert.match(settingsVisual, /label:\s*'模型'/);
  assert.match(settingsVisual, /data-slot="select-trigger"/);
  assert.match(settingsVisual, /cipher-ai-model-combobox/);
  assert.match(settingsVisual, /cipher-ai-model-trigger/);
  assert.match(settingsVisual, /controlKind/);
  assert.match(settingsVisual, /rootHorizontalOverflow/);
  assert.match(settingsVisual, /bodyHorizontalOverflow/);
  assert.match(settingsVisual, /60 \+ 1 \+ 7 \+ 3 \+ 3/);
});

test('settings visual gate uses the current online transcription panel heading', () => {
  assert.match(settingsVisual, /expectedPanel:\s*'在线语音转写'/);
  assert.doesNotMatch(settingsVisual, /expectedPanel:\s*'在线转写服务'/);
});

test('settings visual gate proves the C shell geometry and About card wrapping', () => {
  for (const source of [productionVisual, settingsVisual]) {
    for (const token of [
      'railCount', 'headerTabsInline', 'headerTabsStacked', 'bodyBelowHeader',
      'aboutCardOverflowFailures', '.settings-page-header', '.settings-navigation-tabs',
      '.cipher-about-component-card', '.cipher-about-version-card',
      '.cipher-about-directory-card', '.cipher-about-source-card',
    ]) assert.ok(source.includes(token), `${token} is enforced`);
    assert.match(source, /railCount[^\n]*(?:===|!==)/);
    assert.match(source, /aboutCardOverflowFailures\.length/);
  }
  assert.match(settingsVisual, /rootRect\?\.cw > 900/);
  assert.match(settingsVisual, /not_installed_because_runtime_component_signature_is_missing/);
});

test('settings visual gate permits only its approved Select portal outside the Cipher root', () => {
  assert.match(settingsVisual, /\.cipher-settings-select-popover/);
  assert.match(settingsVisual, /!el\.closest\('\.cipher-settings-select-popover'\)/);
});

test('settings visual gate enforces a zero-to-one-to-zero listbox lifecycle', () => {
  assert.match(settingsVisual, /Input\.dispatchKeyEvent/);
  assert.match(settingsVisual, /waitForListboxCount\(0/);
  assert.match(settingsVisual, /listboxCount !== 0|listboxCount,\s*0/);
});

test('settings visual gate reads its CipherTalk baseline from the locked source commit', () => {
  assert.match(settingsVisual, /b5b580c5af7672a729a0c7fc10b8b1511fe6d478/);
  assert.match(settingsVisual, /execFileSync\(\s*'git'/);
  assert.match(settingsVisual, /show.*src\/pages\/SettingsPage\.css/s);
  assert.doesNotMatch(settingsVisual, /readFileSync\(cipherTalkCssPath/);
});

test('settings visual gate waits for the expected tab and stable geometry', () => {
  const waitSource = extractFunction(settingsVisual, 'waitForStableRender', 'captureAndProbe');
  assert.ok(waitSource, 'waitForStableRender source is present');
  assert.match(waitSource, /expectedTabLabel/);
  assert.match(waitSource, /document\.readyState/);
  assert.match(waitSource, /\.cipher-settings-root/);
  assert.match(waitSource, /\.settings-body/);
  assert.match(waitSource, /getBoundingClientRect/);
  assert.match(waitSource, /stableSamples/);
  assert.match(waitSource, /lastState/);
  assert.doesNotMatch(waitSource, /await document\.fonts\.ready/);
  assert.doesNotMatch(waitSource, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(settingsVisual, /waitForStableRender\(name, expectedTabLabel\)/);
});

test('AI provider and model controls use one neutral focus border without an outer ring', () => {
  assert.match(settingsCss, /\.cipher-ai-provider-trigger:(?:focus-visible|focus)[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--text\)/);
  assert.match(settingsCss, /\.cipher-ai-provider-trigger[\s\S]*?box-shadow:\s*none/);
  assert.match(settingsCss, /\.cipher-ai-model-input-group:focus-within[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--text\)/);
  assert.match(settingsCss, /\.cipher-ai-model-input-group:focus-within[\s\S]*?box-shadow:\s*none/);
  assert.match(settingsCss, /\.cipher-ai-model-trigger:focus-visible[\s\S]*?outline:\s*none/);
  assert.match(settingsCss, /\.cipher-ai-model-trigger:focus-visible[\s\S]*?box-shadow:\s*none/);
  assert.match(settingsCss, /\.cipher-ai-model-input\s*\{[^}]*outline:\s*0[^}]*box-shadow:\s*none/s);
  assert.doesNotMatch(settingsCss, /\.cipher-ai-model-input-group:focus-within\s*\{[^}]*0 0 0 3px/s);
});

test('AI credential text and provider content use the approved centering metrics', () => {
  assert.match(settingsCss, /\.cipher-ai-api-key-input-group \[data-slot='input-group-input'\]\s*\{[^}]*padding:\s*0 12px 0 20px/s);
  assert.match(settingsCss, /\.cipher-ai-provider-select \.cipher-settings-select-value\s*\{[^}]*height:\s*100%[^}]*display:\s*flex[^}]*align-items:\s*center/s);
  assert.match(settingsCss, /\.cipher-ai-provider-option-copy strong\s*\{[^}]*line-height:\s*18px/s);
  assert.match(settingsCss, /\.cipher-ai-provider-option-copy span\s*\{[^}]*line-height:\s*16px/s);
});

test('AI credential focus targets the real HeroUI input-group slots without a nested outline', () => {
  assert.match(settingsCss, /\.cipher-ai-api-key-input-group:has\(\[data-slot='input-group-input'\]:focus\)\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--text\)[^}]*box-shadow:\s*none/s);
  assert.match(settingsCss, /\.cipher-ai-api-key-input-group:has\(\[data-slot='input-group-input'\]:focus-visible\)\s*\{[^}]*box-shadow:\s*0 0 0 2px color-mix\(in srgb, var\(--text\)/s);
  assert.match(settingsCss, /\.cipher-ai-api-key-input-group \[data-slot='input-group-input'\]:focus-visible[\s\S]*?outline:\s*none[\s\S]*?box-shadow:\s*none/);
  assert.doesNotMatch(settingsCss, /\.cipher-ai-api-key-field \[data-slot='input-wrapper'\]/);
});

test('AI provider and model chevrons are single centered controls', () => {
  assert.match(settingsCss, /\.cipher-ai-provider-trigger\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/s);
  assert.match(settingsCss, /\.cipher-ai-provider-trigger \.cipher-settings-select-indicator\s*\{[^}]*position:\s*static[^}]*align-self:\s*center[^}]*margin-left:\s*auto/s);
  assert.match(settingsCss, /\.cipher-ai-model-trigger\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s);
  assert.match(settingsCss, /\.cipher-ai-model-trigger\s*\{[^}]*align-self:\s*center/s);
  assert.doesNotMatch(settingsCss, /\.cipher-ai-(?:provider|model)[^}]*background-image:\s*[^n]/s);
});

test('online transcription and export Select chevrons use the centered indicator contract', () => {
  assert.match(onlineTranscription, /cipher-online-stt-provider-trigger/);
  assert.match(onlineTranscription, /cipher-online-stt-language-trigger/);
  assert.match(dataManagement, /cipher-export-format-trigger/);
  for (const trigger of [
    'cipher-online-stt-provider-trigger',
    'cipher-online-stt-language-trigger',
    'cipher-export-format-trigger',
  ]) {
    assert.match(
      settingsCss,
      new RegExp(`\\.${trigger} \\.cipher-settings-select-indicator[\\s\\S]*?position:\\s*static[\\s\\S]*?align-self:\\s*center[\\s\\S]*?margin-left:\\s*auto[\\s\\S]*?line-height:\\s*0[\\s\\S]*?transform:\\s*none`),
    );
  }
});

test('production visual gate measures AI field focus, padding, and centering', () => {
  assert.match(productionVisual, /aiFormControlAudit/);
  assert.match(productionVisual, /apiKeyPaddingLeft/);
  assert.match(productionVisual, /providerIndicatorCount/);
  assert.match(productionVisual, /modelIndicatorCount/);
  assert.match(productionVisual, /providerCopyCenterDelta/);
  assert.match(productionVisual, /providerIndicatorCenterDelta/);
  assert.match(productionVisual, /modelIndicatorCenterDelta/);
  assert.match(productionVisual, /modelTriggerOutlineStyle/);
  assert.match(productionVisual, /modelInputBoxShadow/);
});
