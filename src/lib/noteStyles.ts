import type { NoteStyle } from './types';

export type NoteStyleOption = {
  id: NoteStyle;
  label: string;
  description: string;
};

export const NOTE_STYLE_OPTIONS: readonly NoteStyleOption[] = [
  { id: 'minimal', label: '精简', description: '只保留最关键的信息' },
  { id: 'detailed', label: '详细', description: '完整呈现背景与依据' },
  { id: 'tutorial', label: '教程', description: '按步骤组织学习路径' },
  { id: 'academic', label: '学术', description: '正式严谨，强调证据边界' },
  { id: 'xiaohongshu', label: '小红书', description: '轻快醒目，便于扫读' },
  { id: 'life_journal', label: '生活向', description: '自然亲切，带有反思感' },
  { id: 'task_oriented', label: '任务导向', description: '突出目标、任务与下一步' },
  { id: 'business', label: '商业风格', description: '聚焦决策、风险与机会' },
  { id: 'meeting_minutes', label: '会议纪要', description: '整理议题、决定与行动项' },
];

export function isNoteStyle(value: string): value is NoteStyle {
  return NOTE_STYLE_OPTIONS.some((option) => option.id === value);
}

export function noteStyleLabel(value: NoteStyle): string {
  return NOTE_STYLE_OPTIONS.find((option) => option.id === value)?.label ?? '精简';
}
