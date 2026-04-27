import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTShapeElement,
  PPTTextElement,
  Slide,
} from '@/lib/types/slides';
import { normalizeLatexSource } from '@/lib/latex-utils';
import type {
  NotebookContentBlock,
  NotebookContentDocument,
  NotebookContentLayout,
  NotebookContentProfile,
  NotebookContentTextTemplate,
  NotebookContentTitleTone,
} from './schema';
import {
  estimateCodeBlockHeight,
  estimateLatexDisplayHeight,
  matrixBlockToLatex,
} from './block-utils';
import { chemistryTextToHtml } from './chemistry';
import { escapeHtml, renderInlineLatexToHtml } from './inline-html';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CARD_INSET_X,
  CARD_INSET_Y,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  CONTENT_WIDTH,
  GRID_GAP_X,
  GRID_GAP_Y,
  GRID_MAX_AUTO_STRETCH_PER_ROW,
  GRID_MIN_CELL_HEIGHT,
  STACK_UNDERFILL_THRESHOLD,
} from './layout-constants';
import {
  estimateParagraphHeight,
  estimateParagraphHeightForWidth,
  estimateParagraphStackHeight,
  estimateParagraphStackHeightForWidth,
  estimateProcessFlowStepCardHeight,
  measureLayoutCardsLayout,
  measureParagraphBlock,
  measureParagraphHeightIfAvailable,
} from './measure';
import { resolveNotebookContentProfile } from './profile';
import { normalizeSlideTextLayout } from '@/lib/slide-text-layout';
import {
  assessNotebookContentDocumentForSlideWithDeps,
  paginateNotebookContentDocumentWithDeps,
  type NotebookDocumentPaginationResult,
  type NotebookSlideContentBudgetAssessment,
} from './slide-pagination';
import { applyAutoHeightReflow } from '@/lib/slide-layout-reflow';
import {
  createCircleShape,
  createLatexElement,
  createLineElement,
  createRectShape,
  createShapeText,
  createTableElement,
  createTextElement,
} from './slide-element-factory';
import { expandBlocks, prepareBlocksForPagination } from './slide-pagination-blocks';
import {
  ARCHETYPE_ALLOWED_BLOCKS,
  arrangeGridBlocksByPlacement,
  getArchetypeLayoutSettings,
  resolveDocumentArchetype,
  resolveDocumentLayout,
  resolveDocumentPattern,
  resolveGridLayout,
  sortBlocksByPlacementOrder,
} from './slide-layout-resolvers';
import {
  blockToGridBody,
  blockToGridHeading,
  fitBulletListBlockToHeight,
  fitGridBodyToHeight,
  fitGridHeadingToHeight,
  fitParagraphBlockToHeight,
} from './slide-grid-copy';

type ContentCardTone = {
  fill: string;
  border: string;
  accent: string;
};
type ProcessFlowBlock = Extract<NotebookContentBlock, { type: 'process_flow' }>;
type LayoutCardsBlock = Extract<NotebookContentBlock, { type: 'layout_cards' }>;
function toFlowStepLabel(
  language: 'zh-CN' | 'en-US',
  block: NotebookContentBlock,
  index: number,
): string {
  const heading = blockToGridHeading(language, block).trim();
  if (heading) return heading;
  return language === 'en-US' ? `Step ${index + 1}` : `步骤 ${index + 1}`;
}

function toFlowStepDetail(language: 'zh-CN' | 'en-US', block: NotebookContentBlock): string {
  const lines = blockToGridBody(language, block)
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean);
  if (lines.length > 0) return lines.join('；');
  return language === 'en-US' ? 'Continue with this stage.' : '继续推进这一阶段。';
}

function buildFlowPatternBlock(args: {
  language: 'zh-CN' | 'en-US';
  orientation: 'horizontal' | 'vertical';
  blocks: NotebookContentBlock[];
}): ProcessFlowBlock {
  const selected = args.blocks.filter((block) => block.type !== 'heading').slice(0, 6);
  const steps = selected.map((block, index) => ({
    title: toFlowStepLabel(args.language, block, index),
    detail: toFlowStepDetail(args.language, block),
  }));
  if (steps.length < 2) {
    steps.push({
      title: args.language === 'en-US' ? 'Wrap up' : '收束',
      detail: args.language === 'en-US' ? 'Summarize the key takeaway.' : '总结本页关键结论。',
    });
  }
  return {
    type: 'process_flow',
    title: args.language === 'en-US' ? 'Learning Flow' : '学习流程',
    orientation: args.orientation,
    context: [],
    steps,
    summary: args.language === 'en-US' ? 'Follow this sequence in class.' : '授课时按这个顺序推进。',
  };
}

function resolveBlockTemplateTone(
  templateId: NotebookContentTextTemplate | undefined,
  fallbackTone: ContentCardTone,
): ContentCardTone {
  if (!templateId) return fallbackTone;
  switch (templateId) {
    case 'plain':
      return { fill: '#ffffff', border: '#cbd5e1', accent: fallbackTone.accent };
    case 'infoCard':
      return { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' };
    case 'successCard':
      return { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' };
    case 'warningCard':
      return { fill: '#fff7ed', border: '#fdba74', accent: '#ea580c' };
    case 'accentCard':
      return { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' };
    default:
      return fallbackTone;
  }
}

function resolveCardTitleColor(
  titleTone: NotebookContentTitleTone | undefined,
  tone: ContentCardTone,
): string {
  switch (titleTone) {
    case 'neutral':
      return '#0f172a';
    case 'inverse':
      return '#ffffff';
    case 'accent':
    default:
      return tone.accent;
  }
}

function getProfileTokens(profile: NotebookContentProfile) {
  if (profile === 'code') {
    return {
      titleAccent: '#0f766e',
      titleText: '#0f172a',
      themeColors: ['#0f766e', '#0f172a', '#155e75', '#334155'],
      backgroundColors: ['#f7fffd', '#f8fafc', '#ecfeff'],
      cardPalettes: [
        { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' },
        { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' },
        { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' },
        { fill: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
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
        { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' },
        { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' },
        { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' },
        { fill: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
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
      { fill: '#f5f9ff', border: '#d9e6ff', accent: '#2f6bff' },
      { fill: '#f7f5ff', border: '#e5defe', accent: '#7a5af8' },
      { fill: '#f4fbf7', border: '#d3f0df', accent: '#12b76a' },
      { fill: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
    ] as const,
    codeSurface: {
      fill: '#0f172a',
      outline: '#1e293b',
      text: '#e2e8f0',
      caption: '#cbd5e1',
    },
  };
}

function createCardGroupId(prefix = 'semantic_card'): string {
  return `${prefix}_${nanoid(8)}`;
}

function createBoundContentCard(args: {
  top: number;
  height: number;
  tone: ContentCardTone;
  html: string;
  color?: string;
  fontName?: string;
  textType?: PPTTextElement['textType'];
  lineHeight?: number;
  paragraphSpace?: number;
}): PPTTextElement {
  return createTextElement({
    left: CONTENT_LEFT,
    top: args.top,
    width: CONTENT_WIDTH,
    height: args.height,
    fill: args.tone.fill,
    outlineColor: args.tone.accent,
    shadow: {
      h: 0,
      v: 8,
      blur: 24,
      color: 'rgba(15,23,42,0.08)',
    },
    html: args.html,
    color: args.color,
    fontName: args.fontName,
    textType: args.textType,
  });
}

function splitCaptionedEquation(rawLatex: string, caption?: string): { latex: string; caption?: string } {
  const raw = normalizeLatexSource(rawLatex.trim()).replace(/\${3,}/g, '$$');
  const envMatch = raw.match(/^(.*?)(\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\3\})(.*)$/);
  if (envMatch?.[2]) {
    const mergedCaption = [caption?.trim(), envMatch[1]?.trim(), envMatch[4]?.trim()]
      .filter(Boolean)
      .join(' ');
    return {
      latex: normalizeLatexSource(envMatch[2]),
      caption: mergedCaption || undefined,
    };
  }

  const wrappedMatch =
    raw.match(/^(.*?)\$\$([\s\S]+?)\$\$(.*)$/) ||
    raw.match(/^(.*?)(?<!\$)\$([\s\S]+?)\$(?!\$)(.*)$/) ||
    raw.match(/^(.*?)\\\[([\s\S]+?)\\\](.*)$/) ||
    raw.match(/^(.*?)\\\(([\s\S]+?)\\\)(.*)$/);

  if (wrappedMatch?.[2]) {
    const mergedCaption = [caption?.trim(), wrappedMatch[1]?.trim(), wrappedMatch[3]?.trim()]
      .filter(Boolean)
      .join(' ');
    return {
      latex: normalizeLatexSource(wrappedMatch[2]),
      caption: mergedCaption || undefined,
    };
  }

  return {
    latex: raw,
    caption: caption?.trim() || undefined,
  };
}

function getLayoutCardsItemTone(
  tone: LayoutCardsBlock['items'][number]['tone'],
  fallbackAccent: string,
): ContentCardTone {
  switch (tone) {
    case 'info':
      return { fill: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' };
    case 'warning':
      return { fill: '#fff7ed', border: '#fdba74', accent: '#ea580c' };
    case 'success':
      return { fill: '#ecfdf5', border: '#a7f3d0', accent: '#16a34a' };
    case 'neutral':
    default:
      return { fill: '#ffffff', border: '#cbd5e1', accent: fallbackAccent };
  }
}

function renderLayoutCardsBlock(args: {
  block: LayoutCardsBlock;
  top: number;
  cardPalettes: readonly ContentCardTone[];
  groupIdPrefix?: string;
}): { elements: PPTElement[]; height: number } {
  const elements: PPTElement[] = [];
  const groupId = createCardGroupId(args.groupIdPrefix || 'layout_cards');
  let cursorTop = args.top;

  if (args.block.title) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: 28,
        groupId,
        html: `<p style="font-size:18px;color:#2563eb;"><strong>${renderInlineLatexToHtml(args.block.title)}</strong></p>`,
        color: '#2563eb',
        textType: 'itemTitle',
      }),
    );
    cursorTop += 34;
  }

  const layout = measureLayoutCardsLayout({
    items: args.block.items,
    columns: args.block.columns,
  });
  const requestedColumns = args.block.columns === 4 ? 2 : args.block.columns;
  const normalizedColumns =
    args.block.items.length === 1
      ? 1
      : args.block.items.length === 2 && requestedColumns >= 2
        ? 2
        : Math.max(1, Math.min(requestedColumns, args.block.items.length));
  const effectiveLayout =
    layout.columns === normalizedColumns
      ? layout
      : (() => {
          const gapX = 10;
          const gapY = 10;
          const cellWidth =
            (CONTENT_WIDTH - Math.max(0, normalizedColumns - 1) * gapX) /
            Math.max(1, normalizedColumns);
          const rowCount = Math.ceil(args.block.items.length / Math.max(1, normalizedColumns));
          const rowHeights = Array.from({ length: rowCount }, () => 0);
          args.block.items.forEach((item, index) => {
            const row = Math.floor(index / Math.max(1, normalizedColumns));
            const body = measureParagraphBlock({
              text: item.text,
              widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
              fontSizePx: 14,
              lineHeightPx: 18,
            });
            const title = measureParagraphBlock({
              text: item.title,
              widthPx: Math.max(120, cellWidth - CARD_INSET_X * 2),
              fontSizePx: 13,
              lineHeightPx: 18,
            });
            rowHeights[row] = Math.max(rowHeights[row], Math.max(72, title.height + body.height + 18));
          });
          return {
            columns: normalizedColumns,
            cellWidth,
            gapX,
            gapY,
            rowHeights,
            totalHeight:
              rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rowHeights.length - 1) * gapY,
          };
        })();
  if (effectiveLayout.columns === 0) {
    return { elements, height: cursorTop - args.top };
  }

  let rowCursorTop = cursorTop;
  let rowIndex = 0;
  args.block.items.forEach((item, index) => {
    const column = index % effectiveLayout.columns;
    const row = Math.floor(index / effectiveLayout.columns);
    if (row !== rowIndex) {
      rowCursorTop += effectiveLayout.rowHeights[rowIndex] + effectiveLayout.gapY;
      rowIndex = row;
    }
    const left = CONTENT_LEFT + column * (effectiveLayout.cellWidth + effectiveLayout.gapX);
    const rowHeight = effectiveLayout.rowHeights[row];
    const fallbackAccent = args.cardPalettes[index % args.cardPalettes.length]?.accent || '#2563eb';
    const tone = getLayoutCardsItemTone(item.tone, fallbackAccent);
    const body = fitParagraphBlockToHeight({
      text: item.text,
      widthPx: Math.max(120, effectiveLayout.cellWidth - CARD_INSET_X * 2),
      fontSizePx: 14,
      lineHeightPx: 18,
      maxHeightPx: rowHeight,
      color: '#334155',
    });
    elements.push(
      createRectShape({
        left,
        top: rowCursorTop,
        width: effectiveLayout.cellWidth,
        height: rowHeight,
        fill: tone.fill,
        outlineColor: tone.border,
        groupId,
        text: createShapeText({
          html: [
            `<p style="font-size:13px;color:${tone.accent};"><strong>${renderInlineLatexToHtml(item.title)}</strong></p>`,
            body.html,
          ].join(''),
          color: '#334155',
          textType: 'content',
          lineHeight: 1.32,
          paragraphSpace: 4,
          align: 'top',
        }),
      }),
    );
  });

  cursorTop += effectiveLayout.totalHeight;
  return {
    elements,
    height: cursorTop - args.top,
  };
}

function processFlowContextToLayoutCardsBlock(
  context: ProcessFlowBlock['context'],
): LayoutCardsBlock | null {
  if (context.length === 0) return null;
  return {
    type: 'layout_cards',
    columns: context.length === 4 ? 4 : context.length >= 3 ? 3 : 2,
    items: context.map((item) => ({
      title: item.label,
      text: item.text,
      tone: item.tone,
    })),
  };
}

function fitProcessFlowSummaryCard(args: {
  summary: string;
  language: 'zh-CN' | 'en-US';
  widthPx: number;
  maxHeightPx: number;
  accent: string;
}): { html: string; height: number } {
  const paragraph = fitParagraphBlockToHeight({
    text: args.summary,
    widthPx: args.widthPx,
    fontSizePx: 14,
    lineHeightPx: 20,
    maxHeightPx: Math.max(28, args.maxHeightPx - 28),
    color: '#334155',
  });

  return {
    html: [
      `<p style="font-size:13px;color:${args.accent};"><strong>${escapeHtml(
        args.language === 'en-US' ? 'Flow Summary' : '流程收束',
      )}</strong></p>`,
      paragraph.html,
    ].join(''),
    height: Math.max(58, paragraph.height + 26),
  };
}


function fitProcessFlowStepCard(args: {
  step: ProcessFlowBlock['steps'][number];
  stepIndex: number;
  language: 'zh-CN' | 'en-US';
  widthPx: number;
  maxHeightPx: number;
  orientation: ProcessFlowBlock['orientation'];
  tone: ContentCardTone;
  showStepLabel?: boolean;
}): { html: string; height: number } {
  const titleFit = fitGridHeadingToHeight({
    text: args.step.title,
    widthPx: args.widthPx,
    maxHeightPx: 48,
    color: '#0f172a',
  });
  const showStepLabel = args.showStepLabel ?? true;
  const labelHtml = showStepLabel
    ? `<p style="font-size:12px;color:${args.tone.accent};"><strong>${escapeHtml(
        args.language === 'en-US' ? `Step ${args.stepIndex + 1}` : `步骤 ${args.stepIndex + 1}`,
      )}</strong></p>`
    : '';
  const noteReserve = args.step.note ? 28 : 0;
  const detailFit = fitParagraphBlockToHeight({
    text: args.step.detail,
    widthPx: args.widthPx,
    fontSizePx: args.orientation === 'horizontal' ? 13 : 14,
    lineHeightPx: args.orientation === 'horizontal' ? 18 : 20,
    maxHeightPx: Math.max(28, args.maxHeightPx - titleFit.height - noteReserve - 24),
    color: '#334155',
  });
  const noteHtml = args.step.note
    ? fitParagraphBlockToHeight({
        text: args.step.note,
        widthPx: args.widthPx,
        fontSizePx: 12,
        lineHeightPx: 16,
        maxHeightPx: 56,
        color: '#475569',
      }).html
    : '';

  const height = (showStepLabel ? 18 : 6) + titleFit.height + detailFit.height + (args.step.note ? 22 : 0);

  return {
    html: [labelHtml, titleFit.html, detailFit.html, noteHtml].filter(Boolean).join(''),
    height: Math.max(72, height),
  };
}


function renderProcessFlowBlock(args: {
  block: ProcessFlowBlock;
  top: number;
  language: 'zh-CN' | 'en-US';
  titleAccent: string;
  cardPalettes: readonly ContentCardTone[];
}): { elements: PPTElement[]; height: number } {
  const elements: PPTElement[] = [];
  const groupId = createCardGroupId('process_flow');
  let cursorTop = args.top;

  if (args.block.title) {
    elements.push(
      createTextElement({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: 28,
        groupId,
        html: `<p style="font-size:18px;color:${args.titleAccent};"><strong>${renderInlineLatexToHtml(args.block.title)}</strong></p>`,
        color: args.titleAccent,
        textType: 'itemTitle',
      }),
    );
    cursorTop += 34;
  }

  const contextCards = processFlowContextToLayoutCardsBlock(args.block.context);
  if (contextCards) {
    const renderedContext = renderLayoutCardsBlock({
      block: contextCards,
      top: cursorTop,
      cardPalettes: args.cardPalettes,
      groupIdPrefix: 'process_flow_context',
    });
    elements.push(...renderedContext.elements);
    cursorTop += renderedContext.height + 14;
  }

  if (args.block.orientation === 'horizontal') {
    const gapX = args.block.steps.length > 3 ? 14 : 18;
    const stepWidth =
      (CONTENT_WIDTH - Math.max(0, args.block.steps.length - 1) * gapX) /
      Math.max(args.block.steps.length, 1);
    const innerWidth = Math.max(104, stepWidth - CARD_INSET_X * 2);
    const stepHeight = Math.min(
      170,
      Math.max(
        112,
        ...args.block.steps.map((step) =>
          estimateProcessFlowStepCardHeight({
            step,
            widthPx: innerWidth,
            orientation: 'horizontal',
          }),
        ),
      ),
    );

    const connectorY = cursorTop + stepHeight / 2;
    args.block.steps.forEach((step, index) => {
      const left = CONTENT_LEFT + index * (stepWidth + gapX);
      const tone = args.cardPalettes[index % args.cardPalettes.length];
      const fitted = fitProcessFlowStepCard({
        step,
        stepIndex: index,
        language: args.language,
        widthPx: innerWidth,
        maxHeightPx: stepHeight - CARD_INSET_Y * 2,
        orientation: 'horizontal',
        tone,
      });

      if (index < args.block.steps.length - 1) {
        const nextLeft = CONTENT_LEFT + (index + 1) * (stepWidth + gapX);
        elements.push(
          createLineElement({
            start: [left + stepWidth, connectorY],
            end: [nextLeft - 3, connectorY],
            color: '#94a3b8',
            width: 2,
            points: ['', 'arrow'],
            groupId,
          }),
        );
      }

      elements.push(
        createTextElement({
          left,
          top: cursorTop,
          width: stepWidth,
          height: stepHeight,
          groupId,
          html: fitted.html,
          color: '#334155',
          textType: 'content',
          fill: tone.fill,
          outlineColor: tone.border,
        }),
      );
    });

    cursorTop += stepHeight + 12;
  } else {
    const timelineX = CONTENT_LEFT + 10;
    const dotSize = 6;
    const cardLeft = CONTENT_LEFT + 26;
    const cardWidth = CONTENT_WIDTH - 26;
    const stepWidth = Math.max(140, cardWidth - CARD_INSET_X * 2);
    const stepHeights = args.block.steps.map((step) =>
      Math.min(
        132,
        estimateProcessFlowStepCardHeight({
          step,
          widthPx: stepWidth,
          orientation: 'vertical',
        }),
      ),
    );
    let localTop = cursorTop;
    const markerCenters = stepHeights.map((_, index) => {
      const centerY = localTop + 14;
      localTop += stepHeights[index] + 12;
      return centerY;
    });
    localTop = cursorTop;

    args.block.steps.forEach((step, index) => {
      const tone = args.cardPalettes[index % args.cardPalettes.length];
      const stepHeight = stepHeights[index];
      const fitted = fitProcessFlowStepCard({
        step,
        stepIndex: index,
        language: args.language,
        widthPx: stepWidth,
        maxHeightPx: stepHeight - CARD_INSET_Y * 2,
        orientation: 'vertical',
        tone,
        showStepLabel: false,
      });
      const markerCenterY = markerCenters[index] ?? localTop + 14;

      elements.push(
        createCircleShape({
          left: timelineX - dotSize / 2,
          top: markerCenterY - dotSize / 2,
          size: dotSize,
          fill: '#94a3b8',
          groupId,
        }),
        createRectShape({
          left: cardLeft,
          top: localTop,
          width: cardWidth,
          height: stepHeight,
          fill: tone.fill,
          outlineColor: tone.border,
          shadow: {
            h: 0,
            v: 6,
            blur: 18,
            color: 'rgba(15,23,42,0.08)',
          },
          groupId,
          text: createShapeText({
            html: fitted.html,
            color: '#334155',
            textType: 'content',
            lineHeight: 1.32,
            paragraphSpace: 4,
            align: 'top',
          }),
        }),
      );

      localTop += stepHeight + 12;
    });

    cursorTop = localTop;
  }

  if (args.block.summary) {
    const fittedSummary = fitProcessFlowSummaryCard({
      summary: args.block.summary,
      language: args.language,
      widthPx: CONTENT_WIDTH - CARD_INSET_X * 2,
      maxHeightPx: 120,
      accent: args.titleAccent,
    });
    elements.push(
      createRectShape({
        left: CONTENT_LEFT,
        top: cursorTop,
        width: CONTENT_WIDTH,
        height: fittedSummary.height,
        fill: '#f8fafc',
        outlineColor: '#cbd5e1',
        groupId,
        text: createShapeText({
          html: fittedSummary.html,
          color: '#334155',
          textType: 'content',
          lineHeight: 1.32,
          paragraphSpace: 4,
          align: 'top',
        }),
      }),
    );
    cursorTop += fittedSummary.height + 12;
  }

  return {
    elements,
    height: cursorTop - args.top,
  };
}

function hasBoxGeometry(element: PPTElement): element is PPTElement & {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return (
    typeof (element as { left?: unknown }).left === 'number' &&
    typeof (element as { top?: unknown }).top === 'number' &&
    typeof (element as { width?: unknown }).width === 'number' &&
    typeof (element as { height?: unknown }).height === 'number'
  );
}

type ShapeBoxElement = PPTShapeElement & {
  left: number;
  top: number;
  width: number;
  height: number;
};

function stripShapeElements(elements: PPTElement[]): PPTElement[] {
  const converted: PPTElement[] = [];
  for (const element of elements) {
    if (element.type !== 'shape') {
      converted.push(element);
      continue;
    }

    const shapeText = element.text?.content?.trim();
    if (!shapeText) {
      continue;
    }

    converted.push({
      id: `text_${nanoid(8)}`,
      type: 'text',
      left: element.left,
      top: element.top,
      width: element.width,
      height: element.height,
      rotate: element.rotate,
      groupId: element.groupId,
      content: shapeText,
      defaultFontName: element.text?.defaultFontName || 'Microsoft YaHei',
      defaultColor: element.text?.defaultColor || '#0f172a',
      textType: element.text?.type,
      lineHeight: element.text?.lineHeight,
      paragraphSpace: element.text?.paragraphSpace,
      fill: element.fill,
      outline: element.outline,
      opacity: element.opacity,
    });
  }
  return converted;
}

function getRowVerticalOverlapRatio(
  a: { top: number; height: number },
  b: { top: number; height: number },
): number {
  const aBottom = a.top + a.height;
  const bBottom = b.top + b.height;
  const overlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(a.top, b.top));
  if (overlap <= 0) return 0;
  return overlap / Math.max(1, Math.min(a.height, b.height));
}

function expandSingleOccupancyRows(elements: PPTElement[]): PPTElement[] {
  const boxed = elements
    .map((element, index) => ({ element, index }))
    .filter(
      (
        item,
      ): item is {
        element: PPTElement & { left: number; top: number; width: number; height: number };
        index: number;
      } => hasBoxGeometry(item.element),
    )
    .sort((a, b) => a.element.top - b.element.top || a.element.left - b.element.left);

  type RowBucket = {
    minTop: number;
    maxBottom: number;
    items: Array<{
      index: number;
      element: PPTElement & { left: number; top: number; width: number; height: number };
    }>;
  };
  const rows: RowBucket[] = [];

  boxed.forEach((item) => {
    const hit = rows.find((row) => {
      const pseudoRow = { top: row.minTop, height: row.maxBottom - row.minTop };
      const overlapRatio = getRowVerticalOverlapRatio(item.element, pseudoRow);
      return overlapRatio >= 0.34;
    });
    if (!hit) {
      rows.push({
        minTop: item.element.top,
        maxBottom: item.element.top + item.element.height,
        items: [item],
      });
      return;
    }
    hit.items.push(item);
    hit.minTop = Math.min(hit.minTop, item.element.top);
    hit.maxBottom = Math.max(hit.maxBottom, item.element.top + item.element.height);
  });

  const cloned = elements.map((element) => ({ ...element })) as PPTElement[];
  rows.forEach((row) => {
    if (row.items.length !== 1) return;
    const single = row.items[0];
    const source = single.element;
    if (source.width < 180 || source.width >= CONTENT_WIDTH * 0.9) return;
    if (source.left < CONTENT_LEFT - 24 || source.left + source.width > CONTENT_LEFT + CONTENT_WIDTH + 24) {
      return;
    }
    if (source.type === 'text' && source.textType === 'notes' && source.width <= 80) return;

    const target = cloned[single.index];
    if (!target || !hasBoxGeometry(target)) return;
    target.left = CONTENT_LEFT;
    target.width = CONTENT_WIDTH;
  });

  return cloned;
}

function alignGridCellRowTop(args: {
  elements: PPTElement[];
  bodyTop: number;
  rowTops: number[];
}): PPTElement[] {
  return args.elements.map((element) => {
    if (!hasBoxGeometry(element)) return element;
    if (!element.groupId?.startsWith('grid_cell_')) return element;
    const match = element.groupId.match(/^grid_cell_(\d+)_(\d+)$/);
    if (!match) return element;
    const row = Number.parseInt(match[1], 10);
    if (!Number.isFinite(row) || row < 0 || row >= args.rowTops.length) return element;
    const expectedTop = args.bodyTop + args.rowTops[row];
    if (Math.abs(element.top - expectedTop) <= 0.5) return element;
    return {
      ...element,
      top: expectedTop,
    };
  });
}

function alignTwoCardLayoutRows(elements: PPTElement[]): PPTElement[] {
  const groups = new Map<string, Array<{ id: string; top: number; left: number; width: number }>>();
  elements.forEach((element) => {
    if (!hasBoxGeometry(element)) return;
    if (!element.groupId?.startsWith('layout_cards_')) return;
    const list = groups.get(element.groupId) || [];
    list.push({ id: element.id, top: element.top, left: element.left, width: element.width });
    groups.set(element.groupId, list);
  });

  if (groups.size === 0) return elements;
  const next = elements.map((element) => ({ ...element })) as PPTElement[];
  const byId = new Map(next.map((element) => [element.id, element] as const));

  for (const cards of groups.values()) {
    if (cards.length !== 2) continue;
    const [a, b] = cards;
    const horizontallySeparated = Math.abs(a.left - b.left) > Math.min(a.width, b.width) * 0.45;
    if (!horizontallySeparated) continue;
    const targetTop = Math.min(a.top, b.top);
    const first = byId.get(a.id);
    const second = byId.get(b.id);
    if (first && hasBoxGeometry(first)) first.top = targetTop;
    if (second && hasBoxGeometry(second)) second.top = targetTop;
  }

  return next;
}

function buildStackUnderfillExpansionRequests(args: {
  elements: PPTElement[];
  bodyTop: number;
  usedBottom: number;
}): Record<string, number> {
  const contentHeight = CONTENT_BOTTOM - args.bodyTop;
  const usedHeight = Math.max(0, args.usedBottom - args.bodyTop);
  const fillRatio = contentHeight > 0 ? usedHeight / contentHeight : 1;
  if (fillRatio >= STACK_UNDERFILL_THRESHOLD) return {};

  const extraSpace = Math.max(0, CONTENT_BOTTOM - args.usedBottom);
  if (extraSpace < 18) return {};

  const candidates = args.elements.filter((element): element is ShapeBoxElement => {
    if (element.type !== 'shape') return false;
    if (!hasBoxGeometry(element)) return false;
    if (element.top < args.bodyTop - 1) return false;
    if (element.left > CONTENT_LEFT + 4) return false;
    if (element.width < CONTENT_WIDTH * 0.75) return false;
    return Boolean(element.text?.content?.trim());
  });
  if (candidates.length === 0) return {};

  const totalWeight = candidates.reduce((sum, item) => sum + Math.max(40, item.height), 0);
  if (totalWeight <= 0) return {};

  const requestedHeights: Record<string, number> = {};
  candidates.forEach((candidate, index) => {
    const weight = Math.max(40, candidate.height);
    const rawDelta = (extraSpace * weight) / totalWeight;
    const roundedDelta = index === candidates.length - 1 ? rawDelta : Math.floor(rawDelta);
    requestedHeights[candidate.id] = Math.max(candidate.height, candidate.height + roundedDelta);
  });
  return requestedHeights;
}

function estimateGridBodyHeight(args: {
  language: 'zh-CN' | 'en-US';
  block: NotebookContentBlock;
  widthPx: number;
}): number {
  if (args.block.type === 'paragraph') {
    return estimateParagraphHeightForWidth({
      text: args.block.text,
      widthPx: args.widthPx,
      fontSizePx: 14,
      lineHeightPx: 20,
    });
  }

  if (args.block.type === 'bullet_list') {
    return estimateParagraphStackHeightForWidth({
      items: args.block.items,
      widthPx: Math.max(120, args.widthPx - 16),
      fontSizePx: 14,
      lineHeightPx: 20,
      paragraphSpacePx: 5,
    });
  }

  const bodyLines = blockToGridBody(args.language, args.block);
  return estimateParagraphStackHeightForWidth({
    items: bodyLines,
    widthPx: Math.max(120, args.widthPx - 16),
    fontSizePx: 14,
    lineHeightPx: 20,
    paragraphSpacePx: 5,
  });
}

function computeAdaptiveGridRowHeights(args: {
  gridRows: number;
  gridColumns: number;
  blockCount: number;
  bodyHeight: number;
  rowDesiredHeights: number[];
}): { rowHeights: number[]; rowTops: number[] } {
  const usedRows = Math.max(1, Math.min(args.gridRows, Math.ceil(args.blockCount / args.gridColumns)));
  const gapTotal = Math.max(0, usedRows - 1) * GRID_GAP_Y;
  const availableHeight = Math.max(usedRows * 48, args.bodyHeight - gapTotal);
  const baseMinHeight = Math.max(72, Math.floor(availableHeight / usedRows) - 2);
  const minTotal = baseMinHeight * usedRows;

  const desired = Array.from({ length: usedRows }, (_, index) =>
    Math.max(baseMinHeight, args.rowDesiredHeights[index] || baseMinHeight),
  );
  const desiredTotal = desired.reduce((sum, value) => sum + value, 0);

  let rowHeights: number[];
  if (desiredTotal <= availableHeight) {
    const leftover = availableHeight - desiredTotal;
    // Keep grid cards close to their content-driven height. Stretching rows to
    // fill the whole body makes sparse pages look unfinished and introduces
    // oversized cards with large internal whitespace.
    const extraPerRow = Math.min(leftover / usedRows, GRID_MAX_AUTO_STRETCH_PER_ROW);
    rowHeights = desired.map((value) => value + extraPerRow);
  } else {
    const desiredExtras = desired.map((value) => Math.max(0, value - baseMinHeight));
    const desiredExtraTotal = desiredExtras.reduce((sum, value) => sum + value, 0);
    const availableExtra = Math.max(0, availableHeight - minTotal);
    const scale = desiredExtraTotal > 0 ? Math.min(1, availableExtra / desiredExtraTotal) : 0;
    rowHeights = desiredExtras.map((extra) => baseMinHeight + extra * scale);
  }

  const rowTops: number[] = [];
  let cursor = 0;
  for (let i = 0; i < rowHeights.length; i += 1) {
    rowTops.push(cursor);
    cursor += rowHeights[i] + GRID_GAP_Y;
  }

  return { rowHeights, rowTops };
}

export interface NotebookDocumentArchetypeValidation {
  isValid: boolean;
  invalidBlockTypes: NotebookContentBlock['type'][];
  reasons: string[];
}

export function validateNotebookContentDocumentArchetype(
  document: NotebookContentDocument,
): NotebookDocumentArchetypeValidation {
  const archetype = resolveDocumentArchetype(document);
  const allowedTypes = new Set(ARCHETYPE_ALLOWED_BLOCKS[archetype]);
  const invalidBlockTypes = Array.from(
    new Set(
      document.blocks.filter((block) => !allowedTypes.has(block.type)).map((block) => block.type),
    ),
  );

  return {
    isValid: invalidBlockTypes.length === 0,
    invalidBlockTypes,
    reasons: invalidBlockTypes.map((type) => `archetype_block_mismatch:${archetype}:${type}`),
  };
}

export function renderNotebookContentDocumentToSlide(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
}): Slide {
  const language = args.document.language || 'zh-CN';
  const profile = resolveNotebookContentProfile(args.document);
  const archetype = resolveDocumentArchetype(args.document);
  const archetypeLayout = getArchetypeLayoutSettings(archetype);
  const documentLayout = resolveDocumentLayout(args.document);
  const documentPattern = resolveDocumentPattern(args.document);
  const tokens = getProfileTokens(profile);
  const cardPalettes = tokens.cardPalettes;
  const orderedBlocks = sortBlocksByPlacementOrder(args.document.blocks);
  let effectiveLayout: NotebookContentLayout = documentLayout;
  let effectiveBlocks = orderedBlocks;
  if (documentLayout.mode === 'stack' && documentPattern === 'multi_column_cards') {
    effectiveLayout = { mode: 'grid', columns: 2 };
  }
  if (documentLayout.mode === 'stack' && documentPattern === 'symmetric_split') {
    effectiveLayout = { mode: 'grid', columns: 2, rows: 1 };
    effectiveBlocks = orderedBlocks.slice(0, 2);
  }
  if (
    documentLayout.mode === 'stack' &&
    (documentPattern === 'flow_horizontal' || documentPattern === 'flow_vertical')
  ) {
    const firstFlowIndex = orderedBlocks.findIndex((block) => block.type === 'process_flow');
    if (firstFlowIndex >= 0) {
      const existing = orderedBlocks[firstFlowIndex] as ProcessFlowBlock;
      const next = [...orderedBlocks];
      next[firstFlowIndex] = {
        ...existing,
        orientation: documentPattern === 'flow_horizontal' ? 'horizontal' : 'vertical',
      };
      effectiveBlocks = next;
    } else {
      effectiveBlocks = [
        buildFlowPatternBlock({
          language,
          orientation: documentPattern === 'flow_horizontal' ? 'horizontal' : 'vertical',
          blocks: orderedBlocks,
        }),
      ];
    }
  }
  const blocks =
    effectiveLayout.mode === 'grid' ? effectiveBlocks : expandBlocks(effectiveBlocks, language);
  const elements: PPTElement[] = [];

  elements.push(
    createRectShape({
      left: CONTENT_LEFT - 14,
      top: archetypeLayout.titleTop + 4,
      width: 10,
      height: archetypeLayout.accentHeight,
      fill: tokens.titleAccent,
    }),
    createTextElement({
      left: CONTENT_LEFT,
      top: archetypeLayout.titleTop,
      width: CONTENT_WIDTH,
      height: archetypeLayout.titleHeight,
      html: `<p style="font-size:${Math.max(28, archetypeLayout.titleFontSize)}px;letter-spacing:-0.5px;font-weight:700;"><span style="background:linear-gradient(90deg, ${tokens.titleAccent}, #7a5af8);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">${renderInlineLatexToHtml(args.document.title || args.fallbackTitle)}</span></p>`,
      color: args.document.titleTextColor || tokens.titleText,
      textType: 'title',
      fill: args.document.titleBackgroundColor || '#eff6ff',
      outlineColor: args.document.titleBorderColor || '#bfdbfe',
    }),
  );

  if (args.document.continuation) {
    const chipLabel =
      language === 'en-US'
        ? `Part ${args.document.continuation.partNumber} of ${args.document.continuation.totalParts}`
        : `续 ${args.document.continuation.partNumber}/${args.document.continuation.totalParts}`;
    elements.push(
      createRectShape({
        left: CONTENT_LEFT + CONTENT_WIDTH - 178,
        top: archetypeLayout.titleTop + 6,
        width: 158,
        height: 24,
        fill: '#eef2ff',
        outlineColor: '#c7d2fe',
      }),
      createTextElement({
        left: CONTENT_LEFT + CONTENT_WIDTH - 170,
        top: archetypeLayout.titleTop + 8,
        width: 142,
        height: 20,
        html: `<p style="font-size:12px;color:#4f46e5;text-align:center;"><strong>${escapeHtml(chipLabel)}</strong></p>`,
        color: '#4f46e5',
        textType: 'notes',
      }),
    );
  }

  if (effectiveLayout.mode === 'grid') {
    const bodyTop = archetypeLayout.bodyTop;
    const bodyHeight = CONTENT_BOTTOM - bodyTop;
    const grid = resolveGridLayout(effectiveLayout, { blockCount: blocks.length, bodyHeight });
    const placedBlocks = arrangeGridBlocksByPlacement(blocks, grid);
    const cellWidth =
      (CONTENT_WIDTH - Math.max(0, grid.columns - 1) * GRID_GAP_X) / Math.max(grid.columns, 1);
    const rowDesiredHeights = Array.from({ length: grid.rows }, () => GRID_MIN_CELL_HEIGHT);
    placedBlocks.forEach((placed) => {
      const innerWidth = Math.max(
        120,
        placed.colSpan * cellWidth + Math.max(0, placed.colSpan - 1) * GRID_GAP_X - CARD_INSET_X * 2,
      );
      const block = placed.block;
      const heading = blockToGridHeading(language, block);
      const headingHeight = fitGridHeadingToHeight({
        text: heading,
        widthPx: innerWidth,
        maxHeightPx: 52,
        color: '#0f172a',
      }).height;
      const bodyHeightEstimate = estimateGridBodyHeight({
        language,
        block,
        widthPx: innerWidth,
      });
      const requiredCardHeight = Math.ceil(headingHeight + bodyHeightEstimate + 20);
      const internalGaps = Math.max(0, placed.rowSpan - 1) * GRID_GAP_Y;
      const perRowNeed = Math.max(
        GRID_MIN_CELL_HEIGHT,
        Math.ceil((requiredCardHeight - internalGaps) / Math.max(1, placed.rowSpan)),
      );
      for (let row = placed.row; row < placed.row + placed.rowSpan && row < grid.rows; row += 1) {
        rowDesiredHeights[row] = Math.max(rowDesiredHeights[row], perRowNeed);
      }
    });
    const adaptive = computeAdaptiveGridRowHeights({
      gridRows: grid.rows,
      gridColumns: grid.columns,
      blockCount: placedBlocks.length,
      bodyHeight,
      rowDesiredHeights,
    });

    placedBlocks.forEach((placed, index) => {
      const block = placed.block;
      if (placed.row >= adaptive.rowHeights.length) return;
      const left = CONTENT_LEFT + placed.col * (cellWidth + GRID_GAP_X);
      const top = bodyTop + adaptive.rowTops[placed.row];
      const cellWidthWithSpan =
        placed.colSpan * cellWidth + Math.max(0, placed.colSpan - 1) * GRID_GAP_X;
      const cellHeightWithSpan = Array.from({ length: placed.rowSpan }).reduce<number>(
        (sum, _, rowOffset) => {
          const rowIndex = placed.row + rowOffset;
          if (rowIndex >= adaptive.rowHeights.length) return sum;
          const gap = rowOffset > 0 ? GRID_GAP_Y : 0;
          return sum + gap + adaptive.rowHeights[rowIndex];
        },
        0,
      );
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[index % cardPalettes.length],
      );
      const titleColor = resolveCardTitleColor(block.titleTone, tone);
      const innerWidth = Math.max(120, cellWidthWithSpan - CARD_INSET_X * 2);
      const heading = blockToGridHeading(language, block);
      const headingFit = fitGridHeadingToHeight({
        text: heading,
        widthPx: innerWidth,
        maxHeightPx: 52,
        color: titleColor,
      });
      const bodyFit = fitGridBodyToHeight({
        language,
        block,
        widthPx: innerWidth,
        maxHeightPx: Math.max(24, cellHeightWithSpan - headingFit.height - 20),
        tone,
      });

      elements.push(
        createTextElement({
          left,
          top,
          groupId: `grid_cell_${placed.row}_${placed.col}`,
          width: cellWidthWithSpan,
          height: cellHeightWithSpan,
          html: `${headingFit.html}${bodyFit.html}`,
          color: '#334155',
          textType: 'content',
          fill: tone.fill,
          outlineColor: tone.accent,
          shadow: {
            h: 0,
            v: 8,
            blur: 24,
            color: 'rgba(15,23,42,0.08)',
          },
        }),
      );
    });

    const gridElements = alignGridCellRowTop({
      elements: stripShapeElements(elements),
      bodyTop,
      rowTops: adaptive.rowTops,
    });
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
      // Grid cards already have explicit row/column sizing. Keep a deterministic
      // row-top invariant here so same-row cards never drift into a staircase.
      elements: gridElements,
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

  let cursorTop = archetypeLayout.bodyTop;
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
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const titleColor = resolveCardTitleColor(block.titleTone, tone);
      const cardTitle = block.cardTitle?.trim() || '';
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxCardInnerHeight = Math.max(28, remainingHeight - CARD_INSET_Y * 2);
      const titleFit = cardTitle
        ? fitGridHeadingToHeight({
            text: cardTitle,
            widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            maxHeightPx: Math.min(56, maxCardInnerHeight),
            color: titleColor,
          })
        : { html: '', height: 0 };
      const titleGap = titleFit.height > 0 ? 6 : 0;
      const maxContentHeight = Math.max(28, maxCardInnerHeight - titleFit.height - titleGap);
      const paragraph = fitParagraphBlockToHeight({
        text: block.text,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 22,
        maxHeightPx: maxContentHeight,
        color: '#334155',
      });
      const contentHeight = titleFit.height + titleGap + paragraph.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: `${titleFit.html}${paragraph.html}`,
          color: '#334155',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'bullet_list') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const titleColor = resolveCardTitleColor(block.titleTone, tone);
      const cardTitle = block.cardTitle?.trim() || '';
      const remainingHeight = Math.max(72, CONTENT_BOTTOM - cursorTop);
      const maxCardInnerHeight = Math.max(40, remainingHeight - CARD_INSET_Y * 2);
      const titleFit = cardTitle
        ? fitGridHeadingToHeight({
            text: cardTitle,
            widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            maxHeightPx: Math.min(56, maxCardInnerHeight),
            color: titleColor,
          })
        : { html: '', height: 0 };
      const titleGap = titleFit.height > 0 ? 6 : 0;
      const maxContentHeight = Math.max(40, maxCardInnerHeight - titleFit.height - titleGap);
      const bulletList = fitBulletListBlockToHeight({
        items: block.items,
        widthPx: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
        fontSizePx: 16,
        lineHeightPx: 20,
        maxHeightPx: maxContentHeight,
        color: '#334155',
        bulletColor: tone.accent,
      });
      const contentHeight = titleFit.height + titleGap + bulletList.height;
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: `${titleFit.html}${bulletList.html}`,
          color: '#334155',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'equation') {
      const sanitizedEquation = splitCaptionedEquation(block.latex, block.caption);
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const toneFill = block.backgroundColor || tone.fill;
      const toneBorder = block.borderColor || tone.border;
      const contentHeight = estimateLatexDisplayHeight(sanitizedEquation.latex, block.display);
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + (sanitizedEquation.caption ? 22 : 0);
      const groupId = createCardGroupId('equation_card');
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: cardHeight,
          fill: toneFill,
          outlineColor: toneBorder,
          groupId,
        }),
      );
      elements.push(
        createLatexElement({
          latex: sanitizedEquation.latex,
          left: CONTENT_LEFT + CARD_INSET_X + 8,
          top: cursorTop + CARD_INSET_Y,
          width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
          height: contentHeight,
          align: block.display ? 'center' : 'left',
          groupId,
          color: block.textColor,
          fill: toneFill,
          outlineColor: toneBorder,
        }),
      );
      if (sanitizedEquation.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            groupId,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(sanitizedEquation.caption)}</p>`,
            color: block.noteTextColor || '#64748b',
            fill: block.noteBackgroundColor,
            outlineColor: block.noteBorderColor,
            textType: 'notes',
          }),
        );
      }
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'matrix') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const toneFill = block.backgroundColor || tone.fill;
      const toneBorder = block.borderColor || tone.border;
      const latex = matrixBlockToLatex(block);
      const contentHeight = estimateLatexDisplayHeight(latex, true);
      const labelHeight = block.label ? 24 : 0;
      const captionHeight = block.caption ? 22 : 0;
      const cardHeight = contentHeight + CARD_INSET_Y * 2 + labelHeight + captionHeight;
      const groupId = createCardGroupId('matrix_card');
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height: cardHeight,
          fill: toneFill,
          outlineColor: toneBorder,
          groupId,
        }),
      );
      if (block.label) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 24,
            groupId,
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
          groupId,
          color: block.textColor,
          fill: toneFill,
          outlineColor: toneBorder,
        }),
      );
      if (block.caption) {
        elements.push(
          createTextElement({
            left: CONTENT_LEFT + CARD_INSET_X + 8,
            top: cursorTop + CARD_INSET_Y + labelHeight + contentHeight + 2,
            width: CONTENT_WIDTH - CARD_INSET_X * 2 - 8,
            height: 22,
            groupId,
            html: `<p style="font-size:13px;color:#64748b;">${escapeHtml(block.caption)}</p>`,
            color: block.noteTextColor || '#64748b',
            fill: block.noteBackgroundColor,
            outlineColor: block.noteBorderColor,
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
          text: createShapeText({
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
            align: 'top',
          }),
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
          text: createShapeText({
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
            align: 'top',
          }),
        }),
      );
      cursorTop += codeHeight + 10;

      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const stepItems = block.steps.map((step, idx) => {
        const focus = step.title || step.focus;
        return `${idx + 1}. ${focus ? `${focus}: ` : ''}${step.explanation}`;
      });
      const stepHeight = Math.min(
        180,
        Math.max(56, estimateParagraphStackHeight(stepItems, 34, 20)),
      );
      const stepCardHeight = stepHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: stepCardHeight,
          tone,
          html: stepItems
            .map((item) => `<p style="font-size:15px;color:#334155;">${escapeHtml(item)}</p>`)
            .join(''),
          color: '#334155',
          textType: 'content',
          lineHeight: 1.35,
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
            text: createShapeText({
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
              align: 'top',
            }),
          }),
        );
        cursorTop += outputHeight + 10;
      }

      continue;
    }

    if (block.type === 'process_flow') {
      const rendered = renderProcessFlowBlock({
        block,
        top: cursorTop,
        language,
        titleAccent: tokens.titleAccent,
        cardPalettes,
      });
      elements.push(...rendered.elements);
      cursorTop += rendered.height;
      visualBlockIndex += Math.max(1, block.steps.length);
      continue;
    }

    if (block.type === 'layout_cards') {
      const rendered = renderLayoutCardsBlock({
        block,
        top: cursorTop,
        cardPalettes,
      });
      elements.push(...rendered.elements);
      cursorTop += rendered.height + 12;
      visualBlockIndex += Math.max(1, block.items.length);
      continue;
    }

    if (block.type === 'table') {
      const groupId = createCardGroupId('table_block');
      const tableEls = createTableElement({
        top: cursorTop,
        headers: block.headers,
        rows: block.rows,
        caption: block.caption,
        groupId,
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
      const baseTonePalette = {
        info: { fill: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
        success: { fill: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
        warning: { fill: '#fff7ed', border: '#fdba74', text: '#c2410c' },
        danger: { fill: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
        tip: { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
      }[block.tone];
      const templateTone = resolveBlockTemplateTone(block.templateId, {
        fill: baseTonePalette.fill,
        border: baseTonePalette.border,
        accent: baseTonePalette.text,
      });
      const measuredBodyHeight = measureParagraphHeightIfAvailable({
        text: block.text,
        widthPx: CONTENT_WIDTH - 22 - 10,
        fontSizePx: 15,
        lineHeightPx: 21,
        color: templateTone.accent,
      });
      const height = (measuredBodyHeight ?? estimateParagraphHeight(block.text, 36, 20)) + (block.title ? 28 : 12);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: templateTone.fill,
          outlineColor: templateTone.border,
          text: createShapeText({
            html: [
              block.title
                ? `<p style="font-size:15px;color:${templateTone.accent};"><strong>${renderInlineLatexToHtml(block.title)}</strong></p>`
                : '',
              `<p style="font-size:15px;color:${templateTone.accent};">${renderInlineLatexToHtml(block.text)}</p>`,
            ]
              .filter(Boolean)
              .join(''),
            color: templateTone.accent,
            textType: 'content',
            align: 'top',
          }),
        }),
      );
      cursorTop += height + 12;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'definition' || block.type === 'theorem') {
      const baseTonePalette =
        block.type === 'definition'
          ? { fill: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' }
          : { fill: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' };
      const templateTone = resolveBlockTemplateTone(block.templateId, {
        fill: baseTonePalette.fill,
        border: baseTonePalette.border,
        accent: baseTonePalette.text,
      });
      const supportText = block.type === 'theorem' ? block.proofIdea : undefined;
      const bodyText = supportText ? `${block.text}\n${supportText}` : block.text;
      const measuredBodyHeight = measureParagraphHeightIfAvailable({
        text: bodyText,
        widthPx: CONTENT_WIDTH - 22 - 10,
        fontSizePx: 15,
        lineHeightPx: 21,
        color: '#334155',
      });
      const height =
        (measuredBodyHeight ?? estimateParagraphHeight(bodyText, 36, 20)) +
        (block.title || block.type === 'definition' || block.type === 'theorem' ? 28 : 12);
      elements.push(
        createRectShape({
          left: CONTENT_LEFT,
          top: cursorTop,
          width: CONTENT_WIDTH,
          height,
          fill: templateTone.fill,
          outlineColor: templateTone.border,
          text: createShapeText({
            html: [
              `<p style="font-size:15px;color:${templateTone.accent};"><strong>${renderInlineLatexToHtml(block.title || (language === 'en-US' ? (block.type === 'definition' ? 'Definition' : 'Theorem') : block.type === 'definition' ? '定义' : '定理'))}</strong></p>`,
              `<p style="font-size:15px;color:#334155;">${renderInlineLatexToHtml(block.text)}</p>`,
              supportText
                ? `<p style="font-size:14px;color:${templateTone.accent};">${renderInlineLatexToHtml(supportText)}</p>`
                : '',
            ]
              .filter(Boolean)
              .join(''),
            color: '#334155',
            textType: 'content',
            align: 'top',
          }),
        }),
      );
      cursorTop += height + 12;
      visualBlockIndex += 1;
      continue;
    }

    if (block.type === 'chem_formula' || block.type === 'chem_equation') {
      const tone = resolveBlockTemplateTone(
        block.templateId,
        cardPalettes[visualBlockIndex % cardPalettes.length],
      );
      const raw = block.type === 'chem_formula' ? block.formula : block.equation;
      const caption = block.caption;
      const contentHeight = 34 + (caption ? 24 : 0);
      const cardHeight = contentHeight + CARD_INSET_Y * 2;
      elements.push(
        createBoundContentCard({
          top: cursorTop,
          height: cardHeight,
          tone,
          html: [
            `<p style="font-size:20px;color:#0f172a;">${chemistryTextToHtml(raw)}</p>`,
            caption ? `<p style="font-size:13px;color:#64748b;">${escapeHtml(caption)}</p>` : '',
          ]
            .filter(Boolean)
            .join(''),
          color: '#0f172a',
          textType: 'content',
          lineHeight: 1.35,
        }),
      );
      cursorTop += cardHeight + 10;
      visualBlockIndex += 1;
      continue;
    }
  }

  const usedBottom = elements
    .filter(hasBoxGeometry)
    .reduce((maxBottom, element) => Math.max(maxBottom, element.top + element.height), archetypeLayout.bodyTop);
  const hasProcessFlowBlock = effectiveBlocks.some((block) => block.type === 'process_flow');
  const underfillExpansion = hasProcessFlowBlock
    ? {}
    : buildStackUnderfillExpansionRequests({
        elements,
        bodyTop: archetypeLayout.bodyTop,
        usedBottom,
      });
  const reflowedElements = applyAutoHeightReflow({
    elements,
    requestedHeights: underfillExpansion,
  });
  const noShapeElements = stripShapeElements(reflowedElements);
  const alignedLayoutCards = alignTwoCardLayoutRows(noShapeElements);

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
    elements: normalizeSlideTextLayout(expandSingleOccupancyRows(alignedLayoutCards), {
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

export type {
  NotebookDocumentPaginationResult,
  NotebookSlideContentBudgetAssessment,
} from './slide-pagination';

const notebookPaginationDeps = {
  resolveNotebookContentProfile,
  resolveDocumentArchetype,
  resolveDocumentLayout,
  resolveGridLayout,
  getArchetypeLayoutSettings,
  prepareBlocksForPagination,
};

export function assessNotebookContentDocumentForSlide(
  document: NotebookContentDocument,
): NotebookSlideContentBudgetAssessment {
  return assessNotebookContentDocumentForSlideWithDeps(document, notebookPaginationDeps);
}

export function paginateNotebookContentDocument(args: {
  document: NotebookContentDocument;
  rootOutlineId: string;
}): NotebookDocumentPaginationResult {
  return paginateNotebookContentDocumentWithDeps(args, notebookPaginationDeps);
}
