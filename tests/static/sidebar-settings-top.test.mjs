import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appCss = readFileSync(join(root, 'src', 'styles', 'app.css'), 'utf8');
const settingsCss = readFileSync(join(root, 'src', 'styles', 'cipher-settings.css'), 'utf8');
const shellTsx = readFileSync(join(root, 'src', 'features', 'settings', 'CipherSettingsShell.tsx'), 'utf8');

function splitRules(css) {
  return css.split(/\}/).map((block) => {
    const brace = block.lastIndexOf('{');
    if (brace < 0) return null;
    return { selector: block.slice(0, brace).replace(/\s+/g, ' ').trim(), body: block.slice(brace + 1) };
  }).filter(Boolean);
}

const appRules = splitRules(appCss);
const settingsRules = splitRules(settingsCss);

test('1. settings page top DOM/structure does not switch on sidebar collapsed state', () => {
  const topSelectors = ['settings-page-header', 'settings-shell-layout', 'settings-navigation-tabs', 'settings-tabs', 'settings-body'];
  for (const rule of settingsRules) {
    if (/(sidebar-collapsed|is-collapsed)/.test(rule.selector) && topSelectors.some((name) => rule.selector.includes(name))) {
      throw new Error(`settings top rule is coupled to sidebar state: ${rule.selector}`);
    }
  }
  assert.equal(shellTsx.includes('sidebarCollapsed'), false, 'CipherSettingsShell must not switch DOM based on sidebar state');
  assert.match(shellTsx, /className="settings-shell-layout"/, 'stable settings shell class expected');
});

test('2. expanded and collapsed use the same desktop grid areas', () => {
  const shellRules = settingsRules.filter((rule) => rule.selector.includes('settings-shell-layout') && /grid-template-areas/.test(rule.body));
  const base = shellRules.filter((rule) => !rule.selector.includes('@container'));
  assert.equal(base.length, 1, 'exactly one desktop settings-shell-layout grid-areas rule expected');
  assert.match(base[0].body, /grid-template-areas:\s*"header\s+tabs"\s*"body\s+body"/, 'desktop grid areas must be header+tabs / body+body');
  const stageIndex = settingsCss.indexOf('@container settings-stage (max-width: 760px)');
  assert.ok(stageIndex >= 0, 'settings-stage 760px container query expected');
  const nextStage = settingsCss.indexOf('@container settings-stage', stageIndex + 10);
  const block = nextStage > -1 ? settingsCss.slice(stageIndex, nextStage) : settingsCss.slice(stageIndex);
  assert.match(block, /grid-template-areas:\s*"header"\s*"tabs"\s*"body"/, 'stacked areas must live inside the 760px settings-stage query');
});

test('3. collapsed state does not change settings top vertical padding/margin', () => {
  const rootRule = settingsRules.find((rule) => rule.selector.includes('.settings-page') && rule.body.includes('padding: 24px clamp'));
  assert.ok(rootRule, 'settings root must use fixed vertical padding 24px');
  const bodyRule = settingsRules.find((rule) => rule.selector.includes('.settings-body') && rule.body.includes('padding: 22px clamp'));
  assert.ok(bodyRule, 'settings body must use fixed vertical padding 22px');
  for (const rule of settingsRules) {
    if (/(sidebar-collapsed|is-collapsed)/.test(rule.selector) && /(settings-page-header|settings-shell-layout|settings-navigation-tabs|settings-tabs|settings-body)/.test(rule.selector)) {
      throw new Error(`vertical settings style coupled to sidebar: ${rule.selector}`);
    }
  }
});

test('4. main content has no duplicate sidebar offset', () => {
  for (const rule of appRules) {
    if (!/(\.app-main|\.workbench-content|\.workbench-app)/.test(rule.selector)) continue;
    assert.doesNotMatch(rule.body, /margin-left:\s*(?!0\b)/, `duplicate horizontal offset in ${rule.selector}`);
    assert.doesNotMatch(rule.body, /padding-left:\s*(?!0\b)/, `duplicate horizontal offset in ${rule.selector}`);
    assert.doesNotMatch(rule.body, /left:\s*(?!0\b|auto\b)/, `duplicate left offset in ${rule.selector}`);
    assert.doesNotMatch(rule.body, /width:\s*calc\(100vw\s*-\s*(220px|88px|var\(--sidebar)/, `sidebar-derived width in ${rule.selector}`);
    assert.doesNotMatch(rule.body, /var\(--sidebar/, `sidebar variable used outside grid in ${rule.selector}`);
  }
  const shell = appRules.find((rule) => rule.selector.trim() === '.workbench-app');
  assert.ok(shell && /grid-template-columns:\s*220px\s+minmax\(0,\s*1fr\)/.test(shell.body), '.workbench-app desktop grid must be the single width source');
  const collapsed = appRules.find((rule) => rule.selector.trim() === '.workbench-app.sidebar-collapsed');
  assert.ok(collapsed && /grid-template-columns:\s*88px\s+minmax\(0,\s*1fr\)/.test(collapsed.body), 'collapsed grid must only change the sidebar column to 88px');
});

test('5. settings navigation has no fixed viewport width', () => {
  for (const rule of settingsRules) {
    if (!/(settings-navigation-tabs|settings-tabs|cipher-settings-primary-tab-list)/.test(rule.selector)) continue;
    assert.doesNotMatch(rule.body, /100vw/, `viewport width in ${rule.selector}`);
    if (!rule.selector.includes('max-width: 520px') && !rule.selector.includes('settings-stage')) {
      assert.doesNotMatch(rule.body, /min-width:\s*(?:560|570|600|640)px/, `fixed wide min-width outside narrow container: ${rule.selector}`);
    }
  }
});

test('6. settings page top has no horizontal overflow primitives', () => {
  const shell = settingsRules.find((rule) => rule.selector.includes('.settings-shell-layout') && rule.body.includes('grid-template-columns'));
  assert.match(shell.body, /grid-template-columns:\s*minmax\(220px,\s*300px\)\s*minmax\(0,\s*1fr\)/, 'shell grid second column must be minmax(0,1fr)');
  assert.doesNotMatch(shell.body, /minmax\(560px|min-width:\s*560px/, 'shell must not hard-code wide columns');
  for (const selector of ['.settings-body', '.settings-tab-panel']) {
    assert.ok(settingsRules.some((rule) => rule.selector.includes(selector) && rule.body.includes('min-width: 0')), `${selector} must allow horizontal shrink`);
  }
  assert.doesNotMatch(settingsCss, /\.settings-navigation-tabs[^}]*width:\s*100vw/, 'nav must not use 100vw');
});

function test(name, fn) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (error) {
    console.error(`✘ ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}