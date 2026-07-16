import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

for (const section of ['外观', '语音转文字', 'AI 接入', '数据管理', '关于']) {
  assert.ok(readme.includes(`「${section}」`), `README documents integrated Settings section: ${section}`);
}

assert.match(readme, /新建提炼.*笔记库.*设置/s, 'README documents main workbench navigation');
assert.match(readme, /CPU.*GPU.*在线/s, 'README documents the three transcription modes');
assert.match(readme, /大模型.*向量.*重排.*联网.*TTS.*作图.*本地智能体/s, 'README documents the AI access boundary');
assert.match(readme, /自定义圆角下拉.*键盘导航/s, 'README documents the styled dropdown behavior');
assert.match(readme, /浅色.*深色/s, 'README documents theme switching');
assert.match(readme, /收起.*展开/s, 'README documents the labelled sidebar control');
assert.match(readme, /折叠后.*图标/s, 'README documents icon-only collapsed behavior');
assert.match(readme, /键盘.*焦点/s, 'README documents keyboard and focus behavior');

console.log('approved workbench documentation contract: pass');
