import katex from 'katex';
import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTLatexElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  Slide,
  TableCell,
} from '@/lib/types/slides';
import { getDirectUnicodeMathSymbol, normalizeLatexSource } from '@/lib/latex-utils';
import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentProfile,
} from './schema';
import {
  estimateCodeBlockHeight,
  estimateLatexDisplayHeight,
  matrixBlockToLatex,
} from './block-utils';
import { chemistryTextToHtml } from './chemistry';
import { resolveNotebookContentProfile } from './profile';
import { normalizeSlideTextLayout } from '@/lib/slide-text-layout';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const CONTENT_LEFT = 64;
const CONTENT_WIDTH = 872;
const CONTENT_BOTTOM = 522;
const CARD_INSET_X = 18;
const CARD_INSET_Y = 12;
const CJK_TEXT_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
type ContentCardTone = {
  fill: string;
  border: string;
  accent: string;
};

function getProfileTokens(profile: NotebookContentProfile) {
  if (profile === 'code') {
    return {
      titleAccent: '#0f766e',
      titleText: '#0f172a',
      themeColors: ['#0f766e', '#0f172a', '#155e75', '#334155'],
      backgroundColors: ['#f7fffd', '#f8fafc', '#ecfeff'],
      cardPalettes: [
        { fill: '#ecfeff', border: '#99f6e4', accent: '#0f766e' },
        { fill: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' },
        { fill: '#f8fafc', border: '#cbd5e1', accent: '#334155' },
        { fill: '#f0fdf4', border: '#bbf7d0', accent: '#16a34a' },
      ] as const,
      codeSurface: {
        fill: '#0f172a',
        outline: '#134e4a',
        text: '#e2e8f0',
        caption: '#99f6e4',
      },
    };
  }

  if (profile === 'math') {
    return {
      titleAccent: '#2563eb',
      titleText: '#0f172a',
      themeColors: ['#2563eb', '#0f172a', '#1d4ed8', '#475569'],
      backgroundColors: ['#f8fbff', '#fdfdff', '#eef4ff'],
      cardPalettes: [
        { fill: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' },
        { fill: '#eef2ff', border: '#c7d2fe', accent: '#4f46e5' },
        { fill: '#f8fafc', border: '#cbd5e1', accent: '#475569' },
        { fill: '#effcf6', border: '#bbf7d0', accent: '#16a34a' },
      ] as const,
      codeSurface: {
        fill: '#0f172a',
        outline: '#1e293b',
        text: '#e2e8f0',
        caption: '#cbd5e1',
      },
    };
  }

  return {
    titleAccent: '#4f46e5',
    titleText: '#0f172a',
    themeColors: ['#4f46e5', '#0f172a', '#334155', '#64748b'],
    backgroundColors: ['#f8fbff', '#fdfdff', '#eef4ff'],
    cardPalettes: [
      { fill: '#eef4ff', border: '#c7d7fe', accent: '#4f46e5' },
      { fill: '#ecfeff', border: '#bae6fd', accent: '#0891b2' },
      { fill: '#f8f5ff', border: '#d8b4fe', accent: '#7c3aed' },
      { fill: '#fff7ed', border: '#fdba74', accent: '#ea580c' },
    ] as const,
    codeSurface: {
      fill: '#0f172a',
      outline: '#1e293b',
      text: '#e2e8f0',
      caption: '#cbd5e1',
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInlineLatexToHtml(text: string): string {
  const pattern = /(\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$([^\n$]+?)\$)/g;
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0];
    const start = match.index ?? 0;
    const end = start + fullMatch.length;
    const expression = normalizeLatexSource(match[2] ?? match[3] ?? match[4] ?? match[5] ?? '');

    result += escapeHtml(text.slice(lastIndex, start));
    const directSymbol = getDirectUnicodeMathSymbol(expression);
    result +=
      directSymbol ??
      katex.renderToString(expression, {
        displayMode: false,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      });
    lastIndex = end;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function estimateParagraphHeight(text: string, charsPerLine: number, lineHeightPx: number): number {
  const lines = Math.max(
    1,
    text
      .split('\n')
      .map((line) => Math.max(1, Math.ceil(line.length / Math.max(charsPerLine, 1))))
      .reduce((sum, value) => sum + value, 0),
  );
  return Math.max(lineHeightPx + 12, lines * lineHeightPx + 18);
}

function estimateParagraphStackHeight(
  items: string[],
  charsPerLine: number,
  lineHeightPx: number,
  paragraphSpacePx = 5,
): number {
  const normalized = items.map((item) => item.trim()).filter(Boolean);
  if (normalized.length === 0) return lineHeightPx + 12;

  const totalLines = normalized.reduce((sum, item) => {
    const wrappedLines = item
      .split('\n')
      .map((line) => Math.max(1, Math.ceil(line.length / Math.max(charsPerLine, 1))))
      .reduce((lineSum, value) => lineSum + value, 0);

    return sum + wrappedLines;
  }, 0);

  return Math.max(
    lineHeightPx + 12,
    totalLines * lineHeightPx + Math.max(0, normalized.length - 1) * paragraphSpacePx + 18,
  );
}

function estimateCharsPerLine(text: string, widthPx: number, fontSizePx: number): number {
  const unitWidth = CJK_TEXT_REGEX.test(text) ? fontSizePx * 0.96 : fontSizePx * 0.56;
  return Math.max(12, Math.floor(widthPx / Math.max(unitWidth, 1)));
}

function wrapLineByWidth(text: string, maxChars: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const hasWhitespace = /\s/.test(normalized);
  if (!hasWhitespace) {
    const chunks: string[] = [];
    let remaining = normalized;
    while (remaining.length > maxChars) {
      chunks.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  const tokens = normalized.split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) lines.push(trimmed);
    current = '';
  };

  for (const token of tokens) {
    if (!token.trim()) {
      current += token;
      continue;
    }

    const candidate = current ? `${current}${token}` : token;
    if (candidate.trim().length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current.trim()) {
      pushCurrent();
    }

    if (token.length <= maxChars) {
      current = token;
      continue;
    }

    let remaining = token;
    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    current = remaining;
  }

  pushCurrent();
  return lines;
}

function wrapTextToLines(text: string, maxChars: number): string[] {
  const paragraphs = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const lines = paragraphs.flatMap((paragraph) => wrapLineByWidth(paragraph, maxChars));
  return lines.length > 0 ? lines : [''];
}

function ellipsizeLine(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function clampWrappedLines(lines: string[], maxLines: number, maxChars: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const tail = [kept[maxLines - 1], ...lines.slice(maxLines)].join(' ');
  kept[maxLines - 1] = ellipsizeLine(tail, maxChars);
  return kept;
}

function fitParagraphBlockToHeight(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  maxHeightPx: number;
  color: string;
}): { html: string; height: number } {
  const maxChars = estimateCharsPerLine(args.text, args.widthPx, args.fontSizePx);
  const wrapped = wrapTextToLines(args.text, maxChars);
  const maxLines = Math.max(1, Math.floor((args.maxHeightPx - 18) / args.lineHeightPx));
  const fittedLines = clampWrappedLines(wrapped, maxLines, maxChars);
  const height = Math.max(args.lineHeightPx + 12, fittedLines.length * args.lineHeightPx + 18);

  return {
    html: fittedLines
      .map(
        (line) =>
          `<p style="font-size:${args.fontSizePx}px;color:${args.color};line-height:${args.lineHeightPx}px;">${renderInlineLatexToHtml(line)}</p>`,
      )
      .join(''),
    height,
  };
}

function fitBulletListBlockToHeight(args: {
  items: string[];
  widthPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  maxHeightPx: number;
  color: string;
  bulletColor: string;
  paragraphGapPx?: number;
}): { html: string; height: number } {
  const paragraphGapPx = args.paragraphGapPx ?? 5;
  const htmlParts: string[] = [];
  let usedHeight = 18;

  for (const item of args.items) {
    const maxChars = estimateCharsPerLine(item, args.widthPx - 16, args.fontSizePx);
    const wrapped = wrapTextToLines(item, maxChars);
    const gap = htmlParts.length > 0 ? paragraphGapPx : 0;
    const remainingHeight = args.maxHeightPx - usedHeight - gap;
    const maxLines = Math.floor(remainingHeight / args.lineHeightPx);
    if (maxLines <= 0) break;

    const fittedLines = clampWrappedLines(wrapped, maxLines, maxChars);
    const truncated = fittedLines.length < wrapped.length;
    const lineHtml = fittedLines
      .map((line, index) =>
        index === 0
          ? `<span style="color:${args.bulletColor};font-weight:700;">•</span> ${renderInlineLatexToHtml(line)}`
          : `${'&nbsp;'.repeat(4)}${renderInlineLatexToHtml(line)}`,
      )
      .join('<br/>');

    htmlParts.push(
      `<p style="font-size:${args.fontSizePx}px;color:${args.color};line-height:${args.lineHeightPx}px;">${lineHtml}</p>`,
    );
    usedHeight += gap + fittedLines.length * args.lineHeightPx;

    if (truncated) break;
  }

  const height = Math.max(args.lineHeightPx + 12, usedHeight);
  return {
    html: htmlParts.join(''),
    height,
  };
}

function createTextElement(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
}): PPTTextElement {
  return {
    id: `text_${nanoid(8)}`,
    type: 'text',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    content: args.html,
    defaultFontName: args.fontName || 'Microsoft YaHei',
    defaultColor: args.color || '#0f172a',
    textType: args.textType,
    lineHeight: 1.35,
  };
}

function createRectShape(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  outlineColor?: string;
}): PPTShapeElement {
  return {
    id: `shape_${nanoid(8)}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fill: args.fill,
    fixedRatio: false,
    outline: args.outlineColor
      ? {
          color: args.outlineColor,
          width: 1,
          style: 'solid',
        }
      : undefined,
  };
}

function createContentCardShell(args: {
  top: number;
  height: number;
  tone: ContentCardTone;
}): PPTElement[] {
  return [
    createRectShape({
      left: CONTENT_LEFT,
      top: args.top,
      width: CONTENT_WIDTH,
      height: args.height,
      fill: args.tone.fill,
      outlineColor: args.tone.border,
    }),
    createRectShape({
      left: CONTENT_LEFT,
      top: args.top,
      width: 8,
      height: args.height,
      fill: args.tone.accent,
    }),
  ];
}

function createLatexElement(args: {
  latex: string;
  left: number;
  top: number;
  width: number;
  height: number;
  align?: PPTLatexElement['align'];
}): PPTLatexElement {
  const latex = normalizeLatexSource(args.latex);
  const directSymbol = getDirectUnicodeMathSymbol(latex);

  return {
    id: `latex_${nanoid(8)}`,
    type: 'latex',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    latex,
    html:
      directSymbol ??
      katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      }),
    align: args.align || 'left',
  };
}

function createTableElement(args: {
  top: number;
  headers?: string[];
  rows: string[][];
  caption?: string;
}): PPTElement[] {
  const rowCount = args.rows.length + (args.headers?.length ? 1 : 0);
  const height = Math.min(220, Math.max(72, rowCount * 34 + 12));
  const headers = args.headers?.length ? args.headers : undefined;
  const data: TableCell[][] = [];
  if (headers) {
    data.push(
      headers.map((header) => ({
        id: `cell_${nanoid(8)}`,
        colspan: 1,
        rowspan: 1,
        text: header,
        style: {
          bold: true,
          backcolor: '#eef2ff',
          color: '#1e1b4b',
        },
      })),
    );
  }
  for (const row of args.rows) {
    data.push(
      row.map((cell) => ({
        id: `cell_${nanoid(8)}`,
        colspan: 1,
        rowspan: 1,
        text: cell,
      })),
    );
  }

  const table: PPTTableElement = {
    id: `table_${nanoid(8)}`,
    type: 'table',
    left: CONTENT_LEFT,
    top: args.top + (args.caption ? 26 : 0),
    width: CONTENT_WIDTH,
    height,
    rotate: 0,
    outline: { color: '#cbd5e1', width: 1, style: 'solid' },
    theme: {
      color: '#4f46e5',
      rowHeader: Boolean(headers),
      rowFooter: false,
      colHeader: false,
      colFooter: false,
    },
    colWidths: new Array(data[0]?.length || 1).fill(1 / Math.max(data[0]?.length || 1, 1)),
    cellMinHeight: 34,
    data,
  };

  const elements: PPTElement[] = [];
  if (args.caption) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: args.top,
        width: CONTENT_WIDTH,
        height: 24,
        html: `<p style="font-size:14px;color:#475569;"><strong>${escapeHtml(args.caption)}</strong></p>`,
        color: '#475569',
        textType: 'notes',
      }),
    );
  }
  elements.push(table);
  return elements;
}

function expandBlocks(
  blocks: NotebookContentDocument['blocks'],
  language: 'zh-CN' | 'en-US',
): NotebookContentBlock[] {
  const expanded: NotebookContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'example') {
      expanded.push({
        type: 'heading',
        level: 2,
        text: block.title || (language === 'en-US' ? 'Worked Example' : '例题讲解'),
      });
      expanded.push({
        type: 'paragraph',
        text: `${language === 'en-US' ? 'Problem: ' : '题目：'}${block.problem}`,
      });
      if (block.givens.length > 0) {
        expanded.push({
          type: 'bullet_list',
          items: block.givens.map((item) => `${language === 'en-US' ? 'Given' : '已知'}: ${item}`),
        });
      }
      if (block.goal) {
        expanded.push({
          type: 'paragraph',
          text: `${language === 'en-US' ? 'Goal: ' : '目标：'}${block.goal}`,
        });
      }
      expanded.push({
        type: 'bullet_list',
        items: block.steps.map(
          (item, idx) => `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${item}`,
        ),
      });
      if (block.answer) {
        expanded.push({
          type: 'callout',
          tone: 'success',
          title: language === 'en-US' ? 'Answer' : '答案',
          text: block.answer,
        });
      }
      if (block.pitfalls.length > 0) {
        expanded.push({
          type: 'bullet_list',
          items: block.pitfalls.map(
            (item) => `${language === 'en-US' ? 'Pitfall' : '易错点'}：${item}`,
          ),
        });
      }
      continue;
    }

    if (block.type === 'derivation_steps') {
      if (block.title) {
        expanded.push({ type: 'heading', level: 3, text: block.title });
      }
      for (const step of block.steps) {
        if (step.format === 'latex') {
          expanded.push({ type: 'equation', latex: step.expression, display: true });
        } else if (step.format === 'chem') {
          expanded.push({ type: 'chem_equation', equation: step.expression });
        } else {
          expanded.push({ type: 'paragraph', text: step.expression });
        }
        if (step.explanation) {
          expanded.push({ type: 'paragraph', text: step.explanation });
        }
      }
      continue;
    }

    expanded.push(block);
  }
  return expanded;
}

export function renderNotebookContentDocumentToSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
}): Slide {
  const language = args.document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(args.document);
  const tokens = getProfileTokens(profile);
  const cardPalettes = tokens.cardPalettes;
  const blocks = expandBlocks(args.document.blocks, language);
  const elements: PPTElement[] = [];

  elements.push(
    createRectShape({
      left: CONTENT_LEFT,
      top: 52,
      width: 10,
      height: 38,
      fill: tokens.titleAccent,
    }),
    createTextElement({
      left: CONTENT_LEFT + 22,
      top: 48,
      width: CONTENT_WIDTH - 22,
      height: 52,
      html: `<p style="font-size:30px;"><strong>${renderInlineLatexToHtml(args.document.title || args.fallbackTitle)}</strong></p>`,
      color: tokens.titleText,
      textType: 'title',
    }),
  );

  let cursorTop = 116;
  let visualBlockIndex = 0;
  for (const block of blocks) {
    if (cursorTop >= CONTENT_BOTTOM) break;

    if (block.type === 'heading') {
      const height = block.level <= 2 ? 34 : 28;
      elements.push(
        createTextElement({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          html: `<p style="font-size:${block.level <= 2 ? 22 : 18}px;color:#1e293b;"><strong>${renderInlineLatexToHtml(block.text)}</strong></p>`,
          color: '#1e293b',
          textType: 'itemTitle',
        }),
      );
      cursorTop += height + 10;
      continue;
    }

    if (block.type === 'paragraph') {
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxContentHeight = Math.max(28, remainingHeight - CARD_INSET_Y * 2);
      const paragraph = fitParagraphBlockToHeight({
        text: block.text,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 22,
        maxHeightPx: maxContentHeight,
        color: '#334155',
      });
      const contentHeight = paragraph.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(...createContentCardShell({ top: cursorTop, height: cardHeight, tone }));
      elements.push(
        createTextElement({
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          html: paragraph.html,
          color: '#334155',
          textType: 'content',
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'bullet_list') {
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxContentHeight = Math.max(40, remainingHeight - CARD_INSET_Y * 2);
      const bulletList = fitBulletListBlockToHeight({
        items: block.items,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 20,
        maxHeightPx: maxContentHeight,
        color: '#334155',
        bulletColor: tone.accent,
      });
      const contentHeight = bulletList.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(...createContentCardShell({ top: cursorTop, height: cardHeight, tone }));
      elements.push(
        createTextElement({
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          html: bulletList.html,
          color: '#334155',
          textType: 'content',
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'equation') {
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const contentHeight = estimateLatexDisplayHeight(block.latex, block.display);
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + (block.caption ? 22 : 0);
      elements.push(...createContentCardShell({ top: cursorTop, height: cardHeight, tone }));
      elements.push(
        createLatexElement({
          latex: block.latex,
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          align: block.display ? 'center' : 'left',
        }),
      );
      if (block.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(block.caption)}</p>`,
            color: '#64748b',
            textType: 'notes',
          }),
        );
      }
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'matrix') {
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const latex = matrixBlockToLatex(block);
      const contentHeight = estimateLatexDisplayHeight(latex, true);
      const labelHeight = block.label ? 24 : 0;
      const captionHeight = block.caption ? 22 : 0;
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + labelHeight + captionHeight;
      elements.push(...createContentCardShell({ top: cursorTop, height: cardHeight, tone }));
      if (block.label) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 24,
            html: `<p style="font-size:15px;color:${tone.accent};"><strong>${escapeHtml(block.label)}</strong></p>`,
            color: tone.accent,
            textType: 'itemTitle',
          }),
        );
      }
      elements.push(
        createLatexElement({
          latex,
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y + labelHeight,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          align: 'center',
        }),
      );
      if (block.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + labelHeight + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(block.caption)}</p>`,
            color: '#64748b',
            textType: 'notes',
          }),
        );
      }
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'code_block') {
      const height = estimateCodeBlockHeight(block.code, block.caption ? 1 : 0);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: tokens.codeSurface.fill,
          outlineColor: tokens.codeSurface.outline,
        }),
        createTextElement({
          left: CONTENT_LEFT + 18,
          top: cursorTop + 14,
          width: CONTENT_WIDTH - 36,
          height: height - 28,
          html: [
            block.caption
              ? `<p style="font-size:14px;color:${tokens.codeSurface.caption};"><strong>${escapeHtml(block.caption)}</strong></p>`
              : '',
            ...block.code
              .split('\n')
              .map(
                (line) =>
                  `<p style="font-size:13px;color:${tokens.codeSurface.text};font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
              ),
          ]
            .filter(Boolean)
            .join(''),
          color: tokens.codeSurface.text,
          fontName: 'Menlo, Monaco, Consolas, monospace',
          textType: 'content',
        }),
      );
      cursorTop += height + 12;
      continue;
    }

    if (block.type === 'code_walkthrough') {
      if (block.title) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT,
            top: cursorTop,
            width: CONTENT_WIDTH,
            height: 28,
            html: `<p style="font-size:18px;color:${tokens.titleAccent};"><strong>${escapeHtml(block.title)}</strong></p>`,
            color: tokens.titleAccent,
            textType: 'itemTitle',
          }),
        );
        cursorTop += 34;
      }

      const codeHeight = estimateCodeBlockHeight(block.code, block.caption ? 1 : 0);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: codeHeight,
          fill: tokens.codeSurface.fill,
          outlineColor: tokens.codeSurface.outline,
        }),
        createTextElement({
          left: CONTENT_LEFT + 18,
          top: cursorTop + 14,
          width: CONTENT_WIDTH - 36,
          height: codeHeight - 28,
          html: [
            block.caption
              ? `<p style="font-size:14px;color:${tokens.codeSurface.caption};"><strong>${escapeHtml(block.caption)}</strong></p>`
              : '',
            ...block.code
              .split('\n')
              .map(
                (line) =>
                  `<p style="font-size:13px;color:${tokens.codeSurface.text};font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
              ),
          ]
            .filter(Boolean)
            .join(''),
          color: tokens.codeSurface.text,
          fontName: 'Menlo, Monaco, Consolas, monospace',
          textType: 'content',
        }),
      );
      cursorTop += codeHeight + 10;

      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const stepItems = block.steps.map((step, idx) => {
        const focus = step.title || step.focus;
        return `${idx + 1}. ${focus ? `${focus}: ` : ''}${step.explanation}`;
      });
      const stepHeight = Math.min(
        180,
        Math.max(56, estimateParagraphStackHeight(stepItems, 34, 20)),
      );
      const stepCardHeight = stepHeight + CARD_INSET_Y * 2;
      elements.push(...createContentCardShell({ top: cursorTop, height: stepCardHeight, tone }));
      elements.push(
        createTextElement({
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: stepHeight,
          html: stepItems
            .map((item) => `<p style="font-size:15px;color:#334155;">${escapeHtml(item)}</p>`)
            .join(''),
          color: '#334155',
          textType: 'content',
        }),
      );
      cursorTop += stepCardHeight + 10;
      visualBlockIndex += 1;

      if (block.output) {
        const outputHeight = estimateCodeBlockHeight(block.output, 1);
        elements.push(
          createRectShape({
            left: CONTENT_LEFT,
            top: cursorTop,
            width: CONTENT_WIDTH,
            height: outputHeight,
            fill: '#111827',
            outlineColor: '#1f2937',
          }),
          createTextElement({
            left: CONTENT_LEFT + 18,
            top: cursorTop + 14,
            width: CONTENT_WIDTH - 36,
            height: outputHeight - 28,
            html: [
              `<p style="font-size:14px;color:#cbd5e1;"><strong>${language === 'en-US' ? 'Output' : '输出'}</strong></p>`,
              ...block.output
                .split('\n')
                .map(
                  (line) =>
                    `<p style="font-size:13px;color:#f8fafc;font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
                ),
            ].join(''),
            color: '#f8fafc',
            fontName: 'Menlo, Monaco, Consolas, monospace',
            textType: 'content',
          }),
        );
        cursorTop += outputHeight + 10;
      }

      continue;
    }

    if (block.type === 'table') {
      const tableEls = createTableElement({
        top: cursorTop,
        headers: block.headers,
        rows: block.rows,
        caption: block.caption,
      });
      elements.push(...tableEls);
      cursorTop +=
        Math.min(
          220,
          Math.max(72, (block.rows.length + (block.headers?.length ? 1 : 0)) * 34 + 12),
        ) + (block.caption ? 38 : 12);
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'callout') {
      const tonePalette = {
        info: { fill: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
        success: { fill: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
        warning: { fill: '#fff7ed', border: '#fdba74', text: '#c2410c' },
        danger: { fill: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
        tip: { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
      }[block.tone];
      const height = estimateParagraphHeight(block.text, 36, 20) + (block.title ? 28 : 12);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: tonePalette.fill,
          outlineColor: tonePalette.border,
        }),
        createTextElement({
          left: CONTENT_LEFT + 16,
          top: cursorTop + 12,
          width: CONTENT_WIDTH - 32,
          height: height - 20,
          html: [
            block.title
              ? `<p style="font-size:15px;color:${tonePalette.text};"><strong>${renderInlineLatexToHtml(block.title)}</strong></p>`
              : '',
            `<p style="font-size:15px;color:${tonePalette.text};">${renderInlineLatexToHtml(block.text)}</p>`,
          ]
            .filter(Boolean)
            .join(''),
          color: tonePalette.text,
          textType: 'content',
        }),
      );
      cursorTop += height + 12;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'chem_formula' || block.type === 'chem_equation') {
      const tone = cardPalettes[visualBlockIndex % cardPalettes.length];
      const raw = block.type === 'chem_formula' ? block.formula : block.equation;
      const caption = block.caption;
      const contentHeight = 34 + (caption ? 24 : 0);
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(...createContentCardShell({ top: cursorTop, height: cardHeight, tone }));
      elements.push(
        createTextElement({
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          html: [
            `<p style="font-size:20px;color:#0f172a;">${chemistryTextToHtml(raw)}</p>`,
            caption ? `<p style="font-size:13px;color:#64748b;">${escapeHtml(caption)}</p>` : '',
          ]
            .filter(Boolean)
            .join(''),
          color: '#0f172a',
          textType: 'content',
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }
  }

  return {
    id: `slide_${nanoid(8)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
    theme: {
      backgroundColor: tokens.backgroundColors[0],
      themeColors: tokens.themeColors,
      fontColor: tokens.titleText,
      fontName: 'Microsoft YaHei',
    },
    elements: normalizeSlideTextLayout(elements, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    }),
    background: {
      type: 'gradient',
      gradient: {
        type: 'linear',
        rotate: 135,
        colors: [
          { pos: 0, color: tokens.backgroundColors[0] },
          { pos: 55, color: tokens.backgroundColors[1] },
          { pos: 100, color: tokens.backgroundColors[2] },
        ],
      },
    },
    type: 'content',
  };
}
