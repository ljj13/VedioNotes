/**
 * Repository-wide privacy scan.
 *
 * Scans the full production codebase for privacy violations:
 * - Hardcoded secrets in production source files
 * - Credentials/secrets written to logs or output
 * - Raw cookie/credential getters exposed to frontend
 * - Credential rehydration patterns in non-settings frontend
 * - High-entropy secrets in tests (likely real, not dummy)
 *
 * Scope: src, src-tauri/src, src-tauri/tests, tests, scripts, docs (README, LICENSE, third-party notices)
 *
 * Rules are numbered (PRIV-001 .. PRIV-006) and failures report path:line:rule_id.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

function walk(path) {
  let results = [];
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'target' || name.startsWith('.reasonix')) continue;
    const child = join(path, name);
    const stat = statSync(child);
    if (stat.isDirectory()) {
      results = results.concat(walk(child));
    } else {
      results.push(child);
    }
  }
  return results;
}

const repoRoot = resolve('.');
const scanDirs = ['src', 'src-tauri/src', 'src-tauri/tests', 'tests', 'scripts'];
const docFiles = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'ATTRIBUTION.md'];

let allFiles = [];
for (const dir of scanDirs) {
  try { allFiles = allFiles.concat(walk(resolve(dir))); } catch { /* dir may not exist */ }
}
for (const doc of docFiles) {
  try { allFiles.push(resolve(doc)); } catch { /* may not exist */ }
}

const sourceExts = new Set(['.ts', '.tsx', '.rs', '.mjs', '.js', '.jsx', '.md', '.json', '.css', '.html', '.toml']);
allFiles = allFiles.filter((f) => {
  const ext = extname(f);
  return sourceExts.has(ext);
});
allFiles = allFiles.filter((f) => !f.includes('node_modules') && !f.includes('/target/') && !f.includes('/dist/'));
// De-duplicate
allFiles = [...new Set(allFiles)];

const violations = [];

function isTestFile(file) {
  return file.includes('.test.') || file.includes('tests') || file.includes('test_');
}

function check(file, source, ruleId, pattern, description) {
  const lines = source.split('\n');
  const re = new RegExp(pattern, 'i');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      const trimmed = lines[i].trim();
      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      violations.push({ file, line: i + 1, ruleId, description, excerpt: trimmed.substring(0, 100) });
    }
  }
}

for (const file of allFiles) {
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { continue; }

  const testFile = isTestFile(file);

  // PRIV-001: Hardcoded secrets in production code (8+ chars)
  if (!testFile) {
    check(file, source, 'PRIV-001',
      /\b(?:password|secret|apiKey|api_key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
      'hardcoded secret literal (8+ chars) in production code');

    // Exclude the redacted() method pattern: api_key: "[redacted]"
    // This is a security pattern, not a leak
    for (let i = violations.length - 1; i >= 0; i--) {
      const v = violations[i];
      if (v.ruleId === 'PRIV-001' && v.excerpt.includes('[redacted]')) {
        violations.splice(i, 1);
      }
    }
    // Also exclude doc comment examples like /// {"apiKey": "..."}
    for (let i = violations.length - 1; i >= 0; i--) {
      const v = violations[i];
      if (v.ruleId === 'PRIV-001' && (v.excerpt.includes('///') || v.excerpt.includes('test') || v.excerpt.includes('dummy') || v.excerpt.includes('example'))) {
        violations.splice(i, 1);
      }
    }
  }

  // PRIV-002: Credentials written to console output (all files)
  check(file, source, 'PRIV-002',
    /console\.(log|info|warn|error|debug)\s*\([^)]*(?:credential|secret|apiKey|api_key|token)/i,
    'credential/secret written to console output');

  // PRIV-003: Raw cookie getter exposed to frontend (production code only)
  if (!testFile) {
    check(file, source, 'PRIV-003',
      /get_download_cookie\b/i,
      'raw Cookie getter (get_download_cookie) used outside permission boundary');
  }

  // PRIV-004: Credential rehydration in non-settings frontend (TS/TSX, non-test, non-settings)
  if (!file.includes('features/settings') && !testFile && /\.(ts|tsx)$/.test(file)) {
    check(file, source, 'PRIV-004',
      /(get|fetch|read|load)\w*(?:Credential|Secret|ApiKey|Token)\w*\s*\(/i,
      'credential rehydration (get/read/fetch secret) outside settings boundary');
  }

  // PRIV-005: High-entropy secret in tests (32+ chars, likely real)
  if (testFile && !file.includes('privacy')) {
    check(file, source, 'PRIV-005',
      /\b(?:password|secret|apiKey|api_key)\s*[:=]\s*['"][a-zA-Z0-9]{32,}['"]/i,
      'hardcoded high-entropy secret in test (32+ chars, use short dummy)');
  }

  // PRIV-006: Real API key patterns (sk-, key-, etc.) in any file
  if (!file.includes('.test.') && !file.includes('privacy')) {
    check(file, source, 'PRIV-006',
      /\b(?:sk-|key-)[a-zA-Z0-9]{20,}['"]/i,
      'real API key pattern (sk-/key- prefix with 20+ chars)');
  }
}

if (violations.length > 0) {
  console.error(`Repository privacy scan FAILED: ${violations.length} violation(s)`);
  for (const v of violations) {
    const relPath = v.file.replace(repoRoot + '\\', '').replace(repoRoot + '/', '');
    console.error(`  ${relPath}:${v.line}  [${v.ruleId}]  ${v.description}`);
    console.error(`    > ${v.excerpt}`);
  }
  process.exit(1);
} else {
  console.log(`Repository privacy scan: pass (${allFiles.length} files scanned across src, src-tauri/src, src-tauri/tests, tests, scripts, docs)`);
}
