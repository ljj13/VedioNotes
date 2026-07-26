import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const conceptCssPath = join(root, 'src/styles/concept-workbench.css');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const app = read('src/App.tsx');
const shell = read('src/components/WorkbenchShell.tsx');
const sidebar = read('src/components/WorkbenchSidebar.tsx');
const appCss = read('src/styles/app.css');
const conceptCss = existsSync(conceptCssPath) ? readFileSync(conceptCssPath, 'utf8') : '';

check(/concept-workbench\.css/.test(app), 'App must import the production concept stylesheet');
check(/concept-workbench/.test(shell), 'WorkbenchShell must expose the production concept root');
check(/sidebar-create-action/.test(sidebar), 'Create must be a dedicated sidebar primary action');
check(/\.concept-workbench \.sidebar-nav button\.sidebar-create-action/.test(conceptCss), 'Create action skin must outrank the generic sidebar button selector');
check(!/sidebar-brand|workspace-profile|本地工作区|隐私模式/.test(sidebar), 'removed sidebar modules must stay deleted');
check(existsSync(conceptCssPath), 'src/styles/concept-workbench.css must exist');
check(/--accent:\s*#187a56/i.test(conceptCss), 'light concept accent must use the accessible approved green token');
check(/--accent:\s*#42c994/i.test(conceptCss), 'dark concept accent must use the approved green token');
check(/\.concept-workbench\[data-theme='light'\]/.test(conceptCss) && /\.concept-workbench\[data-theme='dark'\]/.test(conceptCss), 'workbench tokens must be scoped on the rendered theme host so later root styles cannot replace them');
check(/\.window-top-bar\[data-theme='light'\]/.test(conceptCss) && /\.window-top-bar\[data-theme='dark'\]/.test(conceptCss), 'custom title bar must receive the same collision-safe theme tokens');
check(/\.cipher-settings-select-popover/.test(conceptCss), 'ported HeroUI select portals must receive collision-safe workbench tokens outside the React root');
check(/--accent-contrast:\s*#ffffff/i.test(conceptCss) && /--accent-contrast:\s*#071b14/i.test(conceptCss), 'solid accent controls must expose an accessible theme-specific foreground');
check(/--text-3:\s*#687772/i.test(conceptCss) && /--text-3:\s*#879993/i.test(conceptCss), 'tertiary text tokens must retain readable contrast in both themes');
check(/220px/.test(appCss + conceptCss) && /88px/.test(appCss + conceptCss), 'sidebar must retain 220px/88px geometry');
check(/@media\s*\(max-width:\s*1360px\)/.test(conceptCss), 'four-column Library and History detail layouts must collapse before the 1280px default viewport overflows');
check(/@media\s*\(max-width:\s*9(?:00|60)px\)/.test(appCss + conceptCss), 'concept skin must include the narrow desktop breakpoint');
check(!/\.codex-research|vedionotes-ui-concept\.html/.test(app + shell + sidebar), 'production source must not import the standalone prototype');

const sourceFiles = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(?:tsx|ts)$/.test(name)) sourceFiles.push(path);
  }
};
walk(join(root, 'src'));
for (const path of sourceFiles) {
  const source = readFileSync(path, 'utf8');
  check(!/<select\b|<option\b/.test(source), `native select/option is forbidden: ${path.slice(root.length + 1)}`);
}

assert.deepEqual(failures, [], failures.join('\n'));
console.log(`production UI concept structure: PASS (${sourceFiles.length} TS/TSX files)`);
