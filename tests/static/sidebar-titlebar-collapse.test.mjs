import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const conceptCss = readFileSync(join(root, 'src', 'styles', 'concept-workbench.css'), 'utf8');
const appCss = readFileSync(join(root, 'src', 'styles', 'app.css'), 'utf8');
const shell = readFileSync(join(root, 'src', 'components', 'WorkbenchShell.tsx'), 'utf8');

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test('1. title-bar uses one sidebar-independent three-column layout', () => {
  assert.match(
    rule(conceptCss, '.window-top-bar'),
    /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/,
    'title-bar must use natural brand width, flexible drag region, and fixed controls',
  );
  assert.doesNotMatch(conceptCss, /\.window-top-bar[^,{]*sidebar-collapsed|\.sidebar-collapsed[^,{]*\.window-top-bar/, 'concept skin must not couple the title-bar to sidebar state');
  assert.doesNotMatch(appCss, /\.window-top-bar[^,{]*sidebar-collapsed|\.sidebar-collapsed[^,{]*\.window-top-bar/, 'base skin must not couple the title-bar to sidebar state');
});

test('2. title-bar DOM contains only brand, blank drag region, and controls', () => {
  assert.doesNotMatch(shell, /window-title-caption|本地视频提炼工作台/, 'central title node must be removed, not visually hidden');
  assert.doesNotMatch(shell, /window-top-bar[^\n]*sidebarCollapsed/, 'title-bar class must not read sidebar state');
  assert.doesNotMatch(shell, /window-title-name[^\n]*sidebarCollapsed/, 'brand visibility must not read sidebar state');
  assert.match(shell, /className="window-title-identity"[\s\S]*className="window-drag-spacer"[\s\S]*<WindowControls\s*\/>/, 'title-bar must keep brand, blank drag region, then controls');
});

test('3. brand and drag region retain stable intrinsic layout', () => {
  const identity = rule(conceptCss, '.window-title-identity');
  assert.match(identity, /width:\s*auto/, 'brand must use intrinsic width rather than sidebar width');
  assert.match(identity, /white-space:\s*nowrap/, 'brand text must remain on one line');

  const spacer = rule(conceptCss, '.window-drag-spacer');
  assert.match(spacer, /grid-column:\s*2/, 'drag layer must fill the middle title-bar column');
  assert.match(spacer, /grid-row:\s*1/, 'drag layer must share the caption row');
  assert.match(spacer, /width:\s*100%/, 'drag layer must fill the middle title-bar column width');
});

test('4. only the workbench body grid changes width when the sidebar collapses', () => {
  assert.match(rule(appCss, '.workbench-app'), /grid-template-columns:\s*220px\s+minmax\(0,\s*1fr\)/, 'expanded body must keep the 220px sidebar column');
  assert.match(rule(appCss, '.workbench-app.sidebar-collapsed'), /grid-template-columns:\s*88px\s+minmax\(0,\s*1fr\)/, 'collapsed body must change only its sidebar column');
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
