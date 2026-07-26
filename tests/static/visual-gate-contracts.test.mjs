import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const productionVisual = readFileSync('production-workbench.visual.test.mjs', 'utf8');
const settingsVisual = readFileSync('task13-settings-visual-matrix.mjs', 'utf8');

test('production visual gate targets the current Cipher settings DOM', () => {
  assert.match(productionVisual, /settings:\s*'\.cipher-settings-root'/);
  assert.match(productionVisual, /\.settings-tabs \[role="tab"\]/);
  assert.match(productionVisual, /\.settings-navigation-tabs/);
  assert.doesNotMatch(productionVisual, /'\.settings-navigation-rail'/);
  assert.match(productionVisual, /aria-label="语音转文字模式"/);
  assert.match(productionVisual, /aria-label="AI 能力"/);
  assert.match(productionVisual, /aria-label="数据管理分类"/);
  assert.match(productionVisual, /CPU 转写/);
  assert.match(productionVisual, /大语言模型/);
  assert.doesNotMatch(productionVisual, /\.cipher-settings-tabs/);
  assert.doesNotMatch(productionVisual, /\.settings-tabs-v2/);
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

test('settings visual gate captures three real HeroUI select open states and checks both overflow roots', () => {
  assert.match(settingsVisual, /function openHeroSelect/);
  assert.match(settingsVisual, /label:\s*'默认导出格式'/);
  assert.match(settingsVisual, /label:\s*'服务商'/);
  assert.match(settingsVisual, /label:\s*'模型'/);
  assert.match(settingsVisual, /data-slot="select-trigger"/);
  assert.match(settingsVisual, /rootHorizontalOverflow/);
  assert.match(settingsVisual, /bodyHorizontalOverflow/);
  assert.match(settingsVisual, /60 \+ 1 \+ 7 \+ 3 \+ 3/);
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
