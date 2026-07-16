import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const previewPath = path.join(root, 'workbench-preview.html');

assert.equal(existsSync(previewPath), true, 'a stable top-level preview entry exists');

const preview = readFileSync(previewPath, 'utf8');
assert.doesNotMatch(preview, /<iframe\b/i, 'the preview entry does not use a local-file iframe');
assert.match(
  preview,
  /\.\/\.superpowers\/brainstorm\/ui-proposal-1783996252\/content\/workbench-options\.html/,
  'the preview entry redirects to the latest standalone workbench source',
);

console.log('workbench preview structure: pass');
