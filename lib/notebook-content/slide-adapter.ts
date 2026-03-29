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
import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import { chemistryTextToHtml } from './chemistry';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const CONTENT_LEFT = 64;
const CONTENT_WIDTH = 872;
const CONTENT_BOTTOM = 522;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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

function createLatexElement(args: {
  latex: string;
  left: number;
  top: number;
  width: number;
  height: number;
  align?: PPTLatexElement['align'];
}): PPTLatexElement {
  return {
    id: `latex_${nanoid(8)}`,
    type: 'latex',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    latex: args.latex,
    html: katex.renderToString(args.latex, {
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

function expandBlocks(blocks: NotebookContentDocument['blocks'], language: 'zh-CN' | 'en-US'): NotebookContentBlock[] {
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
        items: block.steps.map((item, idx) => `${language === 'en-US' ? `Step ${idx + 1}` : `步骤 ${idx + 1}`}：${item}`),
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
          items: block.pitfalls.map((item) => `${language === 'en-US' ? 'Pitfall' : '易错点'}：${item}`),
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
  const blocks = expandBlocks(args.document.blocks, language);
  const elements: PPTElement[] = [];

  elements.push(
    createTextElement({
      left: CONTENT_LEFT,
      top: 48,
      width: CONTENT_WIDTH,
      height: 52,
      html: `<p style="font-size:30px;"><strong>${escapeHtml(args.document.title || args.fallbackTitle)}</strong></p>`,
      color: '#0f172a',
      textType: 'title',
    }),
  );

  let cursorTop = 116;
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
          html: `<p style="font-size:${block.level <= 2 ? 22 : 18}px;color:#1e293b;"><strong>${escapeHtml(block.text)}</strong></p>`,
          color: '#1e293b',
          textType: 'itemTitle',
        }),
      );
      cursorTop += height + 10;
      continue;
    }

    if (block.type === 'paragraph') {
      const height = estimateParagraphHeight(block.text, 36, 22);
      elements.push(
        createTextElement({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          html: block.text
            .split('\n')
            .map((line) => `<p style="font-size:16px;color:#334155;">${escapeHtml(line)}</p>`)
            .join(''),
          color: '#334155',
          textType: 'content',
        }),
      );
      cursorTop += height + 10;
      continue;
    }

    if (block.type === 'bullet_list') {
      const height = Math.min(
        180,
        Math.max(56, block.items.reduce((sum, item) => sum + estimateParagraphHeight(item, 34, 20), 0)),
      );
      elements.push(
        createTextElement({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          html: block.items
            .map((item) => `<p style="font-size:16px;color:#334155;">• ${escapeHtml(item)}</p>`)
            .join(''),
          color: '#334155',
          textType: 'content',
        }),
      );
      cursorTop += height + 10;
      continue;
    }

    if (block.type === 'equation') {
      const height = block.display ? 64 : 42;
      elements.push(
        createLatexElement({
          latex: block.latex,
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          align: 'left',
        }),
      );
      cursorTop += height + (block.caption ? 6 : 10);
      if (block.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT,
            top: cursorTop - 2,
            width: CONTENT_WIDTH,
            height: 22,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(block.caption)}</p>`,
            color: '#64748b',
            textType: 'notes',
          }),
        );
        cursorTop += 24;
      }
      continue;
    }

    if (block.type === 'code_block') {
      const lineCount = block.code.split('\n').length;
      const height = Math.min(220, Math.max(84, lineCount * 18 + (block.caption ? 40 : 28)));
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: '#0f172a',
          outlineColor: '#1e293b',
        }),
        createTextElement({
          left: CONTENT_LEFT + 18,
          top: cursorTop + 14,
          width: CONTENT_WIDTH - 36,
          height: height - 28,
          html: [
            block.caption
              ? `<p style="font-size:14px;color:#cbd5e1;"><strong>${escapeHtml(block.caption)}</strong></p>`
              : '',
            ...block.code.split('\n').map(
              (line) =>
                `<p style="font-size:13px;color:#e2e8f0;font-family:Menlo, Monaco, Consolas, monospace;">${escapeHtml(line)}</p>`,
            ),
          ]
            .filter(Boolean)
            .join(''),
          color: '#e2e8f0',
          fontName: 'Menlo, Monaco, Consolas, monospace',
          textType: 'content',
        }),
      );
      cursorTop += height + 12;
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
      cursorTop += Math.min(220, Math.max(72, (block.rows.length + (block.headers?.length ? 1 : 0)) * 34 + 12)) + (block.caption ? 38 : 12);
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
              ? `<p style="font-size:15px;color:${tonePalette.text};"><strong>${escapeHtml(block.title)}</strong></p>`
              : '',
            `<p style="font-size:15px;color:${tonePalette.text};">${escapeHtml(block.text)}</p>`,
          ]
            .filter(Boolean)
            .join(''),
          color: tonePalette.text,
          textType: 'content',
        }),
      );
      cursorTop += height + 12;
      continue;
    }

    if (block.type === 'chem_formula' || block.type === 'chem_equation') {
      const raw = block.type === 'chem_formula' ? block.formula : block.equation;
      const caption = block.caption;
      const height = 34 + (caption ? 24 : 0);
      elements.push(
        createTextElement({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
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
      cursorTop += height + 10;
      continue;
    }
  }

  return {
    id: `slide_${nanoid(8)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: CANVAS_HEIGHT / CANVAS_WIDTH,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#4f46e5', '#0f172a', '#334155', '#64748b'],
      fontColor: '#0f172a',
      fontName: 'Microsoft YaHei',
    },
    elements,
    background: {
      type: 'solid',
      color: '#ffffff',
    },
    type: 'content',
  };
}
