/**
 * CSS isolation test for cipher-settings.css.
 *
 * Verifies that every top-level selector in cipher-settings.css is scoped
 * under .cipher-settings-root, except the unique HeroUI select portal scope.
 * React Aria mounts select popovers under body, so this explicit class is the
 * narrowest safe exception and must not be replaced by global data-slot rules.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, '..', '..', 'src', 'styles', 'cipher-settings.css');
const css = readFileSync(cssPath, 'utf-8');
const lines = css.split('\n');

let failures = [];
let inAtRule = false;
let braceDepth = 0;
const allowedPortalScope = '.cipher-settings-select-popover';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const stripped = line.trim();

  // Track @media / @keyframes nesting
  if (stripped.startsWith('@') && stripped.includes('{')) {
    inAtRule = true;
    braceDepth += 1;
    continue;
  }

  if (inAtRule) {
    braceDepth += (stripped.match(/{/g) || []).length;
    braceDepth -= (stripped.match(/}/g) || []).length;
    if (braceDepth <= 0) {
      inAtRule = false;
      braceDepth = 0;
    }
    continue;
  }

  // Check CSS rule starts (selector followed by {)
  if (stripped.includes('{') && !stripped.startsWith('/*') && !stripped.startsWith('*')) {
    const selectorPart = stripped.split('{')[0].trim();

    // Skip comments
    if (selectorPart.startsWith('/*')) continue;

    // Split comma-separated selectors
    const selectors = selectorPart.split(',').map(s => s.trim());

    for (const sel of selectors) {
      // Allow: empty (continuation), @-rules, :root
      if (!sel || sel.startsWith('@') || sel.startsWith(':root')) continue;

      // Accept [data-theme=...] .cipher-settings-root ... patterns
      // (theme override that still contains .cipher-settings-root)
      if (sel.startsWith('[') && sel.includes('.cipher-settings-root')) continue;

      // Every selector must start with .cipher-settings-root
      if (!sel.startsWith('.cipher-settings-root') && !sel.startsWith(allowedPortalScope)) {
        failures.push(`Line ${i + 1}: "${sel}" is outside the settings root and explicit select portal scope`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`CSS isolation test FAILED: ${failures.length} unscoped selector(s) found:`);
  for (const f of failures) {
    console.error(`  ${f}`);
  }
  process.exit(1);
} else {
  console.log('CSS isolation test PASSED: all selectors scoped under the settings root or explicit select portal');
}
