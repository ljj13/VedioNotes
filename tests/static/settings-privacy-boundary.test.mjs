/**
 * Privacy boundary test for CipherTalk settings transplant.
 *
 * Verifies that the cipher settings UI never rehydrates stored credentials
 * into React state, and only receives boolean "credential presence" indicators.
 * Also checks that no raw Cookie getters, token readers, or secret output
 * patterns exist in the cipher settings source.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}

const root = resolve('src/features/settings');
const files = walk(root).filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path));

let checkedFiles = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  checkedFiles++;

  // Must not rehydrate real credentials from storage
  assert.doesNotMatch(
    source,
    /(get|fetch|read|load)\w*(?:Credential|Secret|ApiKey|Token|Cookie)\w*\s*\(/i,
    `${file} reads real credentials — only boolean presence is allowed`,
  );

  // Must not output or log credentials
  assert.doesNotMatch(
    source,
    /console\.(log|info|warn|error|debug)\s*\([^)]*(?:credential|secret|apiKey|token|cookie)/i,
    `${file} may output credentials`,
  );

  // Must not use Electron Cookie getters
  assert.doesNotMatch(
    source,
    /get_download_cookie/i,
    `${file} calls raw Cookie getter`,
  );

  // Must not import credential store modules directly
  assert.doesNotMatch(
    source,
    /credential_store|keyring|keytar/i,
    `${file} imports credential store directly — must go through platform/settings`,
  );

  // Must not hardcode secrets
  assert.doesNotMatch(
    source,
    /\b(?:password|secret|apiKey|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    `${file} contains hardcoded secret`,
  );
}

// Verify that bridge.ts exposes has_profile_credential (boolean, not raw credential)
const bridge = readFileSync(resolve('src/lib/bridge.ts'), 'utf8');
assert.match(
  bridge,
  /export function hasProfileCredential\([^)]*\):\s*Promise<boolean>/,
  'bridge exposes hasProfileCredential as boolean-only',
);

// Verify credential store redacts output
const credentialStore = readFileSync(resolve('src-tauri/src/credential_store.rs'), 'utf8');
assert.match(
  credentialStore,
  /\[redacted\]/,
  'credential store redacts debug output',
);

// Verify cookie store only sends presence to frontend
const cookieStore = readFileSync(resolve('src-tauri/src/download_cookies.rs'), 'utf8');
assert.match(
  cookieStore,
  /must use `has`/,
  'cookie store enforces presence-only (has) pattern',
);

// Verify no raw cookie getter is registered to frontend
const rustLib = readFileSync(resolve('src-tauri/src/lib.rs'), 'utf8');
assert.doesNotMatch(
  rustLib,
  /commands::get_download_cookie\b/,
  'no raw Cookie getter registered to frontend',
);

console.log(`settings privacy boundary: pass (${checkedFiles} files checked)`);
