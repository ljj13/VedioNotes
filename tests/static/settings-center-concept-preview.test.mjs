import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const previewPath = resolve('.codex-research/tauri-react-ui/vedionotes-settings-center-concept.html');

test('settings center concept is an isolated offline A/B/C preview', () => {
  assert.ok(existsSync(previewPath), `missing ${previewPath}`);
  const html = readFileSync(previewPath, 'utf8');

  for (const variant of ['a', 'b', 'c']) {
    assert.match(html, new RegExp(`data-preview-variant=["']${variant}["']`));
  }
  for (const tab of ['appearance', 'transcription', 'ai', 'data', 'about']) {
    assert.match(html, new RegExp(`data-settings-tab=["']${tab}["']`));
    assert.match(html, new RegExp(`data-settings-panel=["']${tab}["']`));
  }

  assert.match(html, /role=["']tablist["']/);
  assert.match(html, /aria-selected/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.match(html, /word-break:\s*break-word/);
  assert.match(html, /container-type:\s*inline-size/);
  assert.match(html, /function\s+auditLayout\s*\(/);
  assert.match(html, /window\.__SETTINGS_PREVIEW_AUDIT__/);
  for (const boundary of ['settings-stage', 'preview-toolbar', 'settings-page', 'settings-content', 'about-panel']) {
    assert.match(html, new RegExp(`data-overflow-watch=["']${boundary}["']`));
  }
  assert.match(html, /data-copy=["']stress["']/);
  assert.match(html, /not_installed_because_runtime_component_signature_is_missing/);
  assert.ok(
    html.includes('.settings-concept-root:not([data-stress="true"]) [data-copy="stress"]'),
    'normal mode must hide stress copy with specificity that component styles cannot override',
  );

  const behaviorlessButtons = [...html.matchAll(/<button\b[^>]*>/gi)]
    .map(([openingTag]) => openingTag)
    .filter((openingTag) => !/data-preview-variant|data-stress-toggle|data-settings-tab/i.test(openingTag))
    .filter((openingTag) => {
      const isNativelyDisabled = /\sdisabled(?:\s|>|=)/i.test(openingTag);
      const isAriaDisabled = /aria-disabled=["']true["']/i.test(openingTag);
      const isRemovedFromTabOrder = /tabindex=["']-1["']/i.test(openingTag);
      return !isNativelyDisabled && !(isAriaDisabled && isRemovedFromTabOrder);
    });
  assert.deepEqual(
    behaviorlessButtons,
    [],
    `non-interactive preview buttons must be explicitly disabled: ${behaviorlessButtons.join(', ')}`,
  );
  assert.doesNotMatch(html, /role=["']switch["']/i);
  assert.doesNotMatch(
    html,
    /<script\s+[^>]*src=|<link\s+[^>]*rel=["']stylesheet|<(?:script|img|link|iframe|object|embed)\b[^>]*(?:src|href|data)=["']https?:|@import|\burl\s*\(|\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|\bimport\s*\(|@tauri-apps|@heroui/i,
  );
  assert.doesNotMatch(html, /sidebar-brand|workspace-profile|本地工作区|隐私模式|<select\b/i);
});
