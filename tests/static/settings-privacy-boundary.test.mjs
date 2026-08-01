/**
 * Privacy boundary test for CipherTalk settings transplant.
 *
 * Verifies that stored credentials are not loaded during page initialization.
 * One explicit user-triggered reveal path is permitted for the selected summary
 * provider, while persistence, logging, raw Cookie access, and broad credential
 * readers remain prohibited.
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
const explicitRevealFile = resolve('src/features/settings/tabs/AiAccessTab.tsx');

let checkedFiles = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  checkedFiles++;

  if (resolve(file) !== explicitRevealFile) {
    assert.doesNotMatch(
      source,
      /(get|fetch|read|load|reveal)\w*(?:Credential|Secret|ApiKey|Token|Cookie)\w*\s*\(/i,
      `${file} reads real credentials outside the approved explicit reveal component`,
    );
  }

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

const aiAccess = readFileSync(explicitRevealFile, 'utf8');
assert.match(
  aiAccess,
  /handleToggleApiKeyVisibility[\s\S]*settingsPlatform\.ai\.revealCredential\(/,
  'stored API Key reveal is only initiated by the eye-button handler',
);
assert.match(aiAccess, /window\.setTimeout\([\s\S]*20_000/, 'revealed API Key is time-limited');
assert.match(aiAccess, /window\.addEventListener\('blur'/, 'window blur conceals the revealed API Key');
assert.doesNotMatch(aiAccess, /localStorage[\s\S]{0,160}revealedStoredApiKey/i, 'revealed API Key is never persisted');
assert.doesNotMatch(aiAccess, /console\.[a-z]+[\s\S]{0,160}revealedStoredApiKey/i, 'revealed API Key is never logged');

// Verify that bridge.ts exposes has_profile_credential (boolean, not raw credential)
const bridge = readFileSync(resolve('src/lib/bridge.ts'), 'utf8');
assert.match(
  bridge,
  /export function hasProfileCredential\([^)]*\):\s*Promise<boolean>/,
  'bridge exposes hasProfileCredential as boolean-only',
);
assert.match(
  bridge,
  /export function revealSummaryProfileCredential\(profileId: string\): Promise<string>/,
  'bridge exposes the narrow summary-profile reveal command',
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
assert.match(
  rustLib,
  /commands::reveal_summary_profile_credential\b/,
  'the explicit summary credential reveal command is registered',
);

const rustCommands = readFileSync(resolve('src-tauri/src/commands.rs'), 'utf8');
assert.match(
  rustCommands,
  /reveal_summary_profile_credential_for_services[\s\S]*credential_store\(\)\.get\("summary", profile_id\)/,
  'credential reveal is restricted to summary profiles',
);

console.log(`settings privacy boundary: pass (${checkedFiles} files checked)`);
