/**
 *安全的 Markdown 渲染组件——渲染 Markdown 文本，防止 XSS 攻击。
 */

import { Fragment, createElement, type ReactNode } from 'react';

export type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'blockquote'; text: string }
  | { kind: 'code'; language: string | null; text: string }
  | { kind: 'rule' };

/** contentLines */
function contentLines(content: string): string[] {
  const lines = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return lines;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return closing > 0 ? lines.slice(closing + 1) : lines;
}

/** isRule */
function isRule(line: string): boolean {
  const compact = line.trim().replace(/\s/g, '');
  return compact.length >= 3 && (/^-+$/.test(compact) || /^\*+$/.test(compact) || /^_+$/.test(compact));
}

/** parseMarkdown */
export function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = contentLines(content);
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([^\s`]*)\s*$/);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: 'code', language: fence[1] || null, text: code.join('\n') });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (isRule(line)) {
      flushParagraph();
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'blockquote', text: quote.join(' ') });
      continue;
    }

    if (/^\s*[-+*]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\s*[-+*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-+*]\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'unordered-list', items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'ordered-list', items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

/** isSafeMarkdownUrl */
export function isSafeMarkdownUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** renderInline */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const token = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^\s)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = token.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const value = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (value.startsWith('`')) {
      nodes.push(<code key={key}>{value.slice(1, -1)}</code>);
    } else if (value.startsWith('**') || value.startsWith('__')) {
      nodes.push(<strong key={key}>{value.slice(2, -2)}</strong>);
    } else if (value.startsWith('*') || value.startsWith('_')) {
      nodes.push(<em key={key}>{value.slice(1, -1)}</em>);
    } else {
      const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const isImage = match.index > 0 && text[match.index - 1] === '!';
      if (link && !isImage && isSafeMarkdownUrl(link[2])) {
        nodes.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">{link[1]}</a>);
      } else if (link && !isImage) {
        nodes.push(<Fragment key={key}>{link[1]}</Fragment>);
      } else {
        nodes.push(value);
      }
    }
    cursor = match.index + value.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** renderBlock */
function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  const key = `markdown-block-${index}`;
  if (block.kind === 'heading') {
    return createElement(`h${block.level}`, { key }, renderInline(block.text, key));
  }
  if (block.kind === 'paragraph') return <p key={key}>{renderInline(block.text, key)}</p>;
  if (block.kind === 'unordered-list') {
    return <ul key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</ul>;
  }
  if (block.kind === 'ordered-list') {
    return <ol key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</ol>;
  }
  if (block.kind === 'blockquote') return <blockquote key={key}><p>{renderInline(block.text, key)}</p></blockquote>;
  if (block.kind === 'code') return <pre key={key}><code data-language={block.language ?? undefined}>{block.text}</code></pre>;
  return <hr key={key} />;
}

/** SafeMarkdown */
export default function SafeMarkdown({ content }: { content: string }) {
  return <article className="saved-markdown">{parseMarkdown(content).map(renderBlock)}</article>;
}
