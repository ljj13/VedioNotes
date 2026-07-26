/**
 *测试文件——测试 capabilityContract 组件/模块的行为是否符合预期。
 */

import { describe, expect, it } from 'vitest';

import { capabilityContract } from './capabilityContract';

// describe('production capability contract', () => {
describe('production capability contract', () => {
  // it('maps every currently enabled shell interaction to an exe
  it('maps every currently enabled shell interaction to an executable workflow', () => {
    const shellControls = [
      '打开首页',
      '打开新建提炼',
      '打开笔记库',
      '打开 AI 问答',
      '打开历史任务',
      '打开设置',
      '折叠或展开侧边栏',
    ];

    expect(capabilityContract.filter((row) => shellControls.includes(row.control)).map((row) => row.control)).toEqual(shellControls);
    for (const row of capabilityContract) {
      expect(row.id).not.toBe('');
      expect(row.handler).not.toBe('');
      expect(row.bridge).not.toBe('');
      expect(row.service).not.toBe('');
      expect(row.effect).not.toBe('');
      expect(row.failure).not.toBe('');
      expect(row.tests.length).toBeGreaterThan(0);
    }
  });
});
