import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [endpoint = 'http://127.0.0.1:9238', targetUrl = 'http://127.0.0.1:4178', outputArg = 'outputs/task12-visual/final'] = process.argv.slice(2);
const outputDir = resolve(outputArg);
const metricsPath = join(outputDir, 'metrics.json');
const visualScript = resolve('production-workbench.visual.test.mjs');
const resume = process.argv.includes('--resume');
const reviewFix = process.argv.includes('--review-fix');

const cases = [
  // Eight application routes.
  ['route-home-wide', 'route-home', 2048, 1152],
  ['route-create-desktop', 'route-create', 1280, 800],
  ['route-library-compact', 'route-library', 960, 720],
  ['route-qa-narrow', 'route-qa', 640, 900],
  ['route-tasks-wide', 'route-tasks', 2048, 1152],
  ['route-progress-desktop', 'route-progress', 1280, 800],
  ['route-result-compact', 'route-result', 960, 720],
  ['route-settings-narrow', 'route-settings', 640, 900],

  // Five Settings top-level sections.
  ['settings-top-appearance-wide', 'settings-appearance', 2048, 1152],
  ['settings-top-transcription-desktop', 'settings-transcription-cpu', 1280, 800],
  ['settings-top-ai-compact', 'settings-ai', 960, 720],
  ['settings-top-data-narrow', 'settings-data-export', 640, 900],
  ['settings-top-about-wide', 'settings-about', 2048, 1152],

  // Seven AI capability tabs.
  ['settings-ai-llm-desktop', 'settings-ai-llm', 1280, 800],
  ['settings-ai-vector-compact', 'settings-ai-vector', 960, 720],
  ['settings-ai-rerank-narrow', 'settings-ai-rerank', 640, 900],
  ['settings-ai-web-wide', 'settings-ai-web', 2048, 1152],
  ['settings-ai-tts-desktop', 'settings-ai-tts', 1280, 800],
  ['settings-ai-image-compact', 'settings-ai-image', 960, 720],
  ['settings-ai-agent-narrow', 'settings-ai-agent', 640, 900],

  // Four data-management tabs.
  ['settings-data-export-wide', 'settings-data-export', 2048, 1152],
  ['settings-data-cache-desktop', 'settings-data-cache', 1280, 800],
  ['settings-data-downloads-compact', 'settings-data-downloads', 960, 720],
  ['settings-data-logs-narrow', 'settings-data-logs', 640, 900],

  // Three transcription tabs.
  ['settings-transcription-cpu-wide', 'settings-transcription-cpu', 2048, 1152],
  ['settings-transcription-gpu-desktop', 'settings-transcription-gpu', 1280, 800],
  ['settings-transcription-online-compact', 'settings-transcription-online', 960, 720],

  // SenseVoice lifecycle states.
  ['sensevoice-missing-narrow', 'settings-sensevoice-missing', 640, 900],
  ['sensevoice-downloading-wide', 'settings-sensevoice-downloading', 2048, 1152],
  ['sensevoice-ready-desktop', 'settings-sensevoice-ready', 1280, 800],
  ['sensevoice-error-compact', 'settings-sensevoice-error', 960, 720],

  // Theme and collapsed-sidebar variants (dark is the default for all other cases).
  ['route-create-light-wide', 'route-create-light', 2048, 1152],
  ['route-library-collapsed-desktop', 'route-library-collapsed', 1280, 800],

  // Every enabled custom select is captured with its listbox open.
  ['dropdown-appearance-theme', 'settings-appearance-dropdown', 960, 720],
  ['dropdown-export-format', 'settings-data-export-dropdown', 640, 900],
  ['dropdown-log-level', 'settings-data-logs-dropdown', 1280, 800],
  ['dropdown-online-transcription', 'settings-transcription-online-dropdown', 2048, 1152],
  ['dropdown-ai-provider', 'settings-ai-llm-provider-dropdown', 960, 720],
  ['dropdown-ai-model', 'settings-ai-llm-model-dropdown', 1280, 800],
  ['dropdown-image-size', 'settings-ai-image-size-dropdown', 640, 900],

  // Remaining production custom-select instances from the review inventory.
  ['dropdown-note-style-service-picker', 'route-create-note-style-dropdown', 1280, 800],
  ['dropdown-core-summary-service-picker', 'route-create-summary-dropdown', 960, 720],
  ['dropdown-transcription-service-picker', 'route-create-transcription-dropdown', 640, 900],
  ['dropdown-profile-provider', 'settings-transcription-profile-provider-dropdown', 1280, 800],
  ['dropdown-profile-discovered-model', 'settings-ai-profile-discovered-model-dropdown', 960, 720],
  ['dropdown-fallback-transcription', 'settings-transcription-online-fallback-dropdown', 640, 900],
  ['disabled-ai-protocol', 'settings-ai-llm-protocol-disabled', 1280, 800],
  ['dropdown-vector-provider-preset', 'settings-ai-vector-provider-dropdown', 2048, 1152],
  ['dropdown-rerank-provider-preset', 'settings-ai-rerank-provider-dropdown', 1280, 800],
  ['dropdown-web-provider-preset', 'settings-ai-web-provider-dropdown', 960, 720],
  ['dropdown-tts-provider-preset', 'settings-ai-tts-provider-dropdown', 640, 900],
  ['dropdown-image-provider-preset', 'settings-ai-image-provider-dropdown', 2048, 1152],
  ['dropdown-agent-provider-preset', 'settings-ai-agent-provider-dropdown', 1280, 800],
].map(([id, mode, width, height]) => ({ id, mode, width, height }));

if (cases.length !== 53) throw new Error(`Task 12 visual matrix must contain exactly 53 cases, received ${cases.length}`);
mkdirSync(outputDir, { recursive: true });
const previous = resume && existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : null;
const previousById = new Map((previous?.cases ?? []).map((item) => [item.id, item]));

const report = {
  startedAt: new Date().toISOString(),
  endpoint,
  targetUrl,
  outputDir,
  total: cases.length,
  passed: 0,
  failed: 0,
  viewportCounts: {},
  cases: [],
};

for (const testCase of cases) {
  const viewport = `${testCase.width}x${testCase.height}`;
  report.viewportCounts[viewport] = (report.viewportCounts[viewport] ?? 0) + 1;
  const screenshot = join(outputDir, `${testCase.id}.png`);
  const previousCase = previousById.get(testCase.id);
  const affectedByReviewFix = reviewFix && (testCase.mode.startsWith('settings') || testCase.mode === 'route-settings');
  if (resume && !affectedByReviewFix && previousCase?.status === 'passed' && existsSync(screenshot)) {
    report.passed += 1;
    report.cases.push(previousCase);
    console.log(`SKIP ${testCase.id} (${viewport}, already passed)`);
    continue;
  }
  mkdirSync(dirname(screenshot), { recursive: true });
  const started = Date.now();
  const run = spawnSync(process.execPath, [visualScript, endpoint, targetUrl, screenshot, String(testCase.width), String(testCase.height), testCase.mode], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const stdoutLines = (run.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  let metrics = null;
  try { metrics = stdoutLines.length ? JSON.parse(stdoutLines.at(-1)) : null; } catch {}
  const status = run.status === 0 && !run.error ? 'passed' : 'failed';
  report[status === 'passed' ? 'passed' : 'failed'] += 1;
  report.cases.push({
    ...testCase,
    viewport,
    status,
    durationMs: Date.now() - started,
    screenshot,
    metrics,
    error: status === 'failed' ? (run.error?.message ?? (run.stderr || run.stdout || `exit ${run.status}`).trim()) : null,
  });
  writeFileSync(metricsPath, `${JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`${status === 'passed' ? 'PASS' : 'FAIL'} ${testCase.id} (${viewport}, ${testCase.mode})`);
}

report.completedAt = new Date().toISOString();
writeFileSync(metricsPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, metricsPath }));
process.exitCode = report.failed === 0 ? 0 : 1;
