import type { Scene, SlideContent } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';
import type { NotebookContentBlock, NotebookContentDocument } from './schema';
import {
  compileSyntaraMarkupToNotebookDocument,
  normalizeSyntaraMarkupLayout,
} from '@/lib/notebook-content/markup';
import { renderNotebookContentDocumentToSlide } from './slide-adapter';
import { normalizeSlideTextLayout, validateSlideTextLayout } from '@/lib/slide-text-layout';
import { normalizeMathSource } from '@/lib/math-engine';

export const SEMANTIC_SLIDE_RENDER_VERSION = 36;

const SEMANTIC_TEXT_FIELD_KEYS = new Set([
  'answer',
  'caption',
  'detail',
  'givens',
  'goal',
  'headers',
  'items',
  'label',
  'note',
  'pitfalls',
  'problem',
  'proofIdea',
  'rows',
  'steps',
  'summary',
  'text',
  'title',
]);

function normalizeSemanticTextSource(text: string): string {
  return text
    .replace(/<\/?(?:begin|end)\{[^}]+\}>?/gi, '')
    .replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\')
    .replace(/\\step\{([^{}]+)\}\{([^{}]+)\}/g, '$1：$2')
    .replace(/\\step\{([^{}]+)\}/g, '$1：')
    .replace(
      /\\(?:begin|end)\{(?:slide|row|rows|column|columns|cell|grid|block|left|right|derivation|steps|solution)\}(?:\[[^\]]*\])?/g,
      '',
    )
    .replace(/\\[;,!]/g, ' ')
    .replace(/^\s*\${2}\s*$/gm, '')
    .replace(/([。.!?！？；;])\\{2,}\s*/g, '$1\n')
    .replace(/\s+\\{2,}\s+/g, '\n')
    .replace(/[ \t]*\\(?:qquad|quad)(?=\s|$)/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeSemanticTextFields(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return key && SEMANTIC_TEXT_FIELD_KEYS.has(key) ? normalizeSemanticTextSource(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSemanticTextFields(item, key));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      normalizeSemanticTextFields(entryValue, entryKey),
    ]),
  );
}

function normalizeBlockTextFields(block: NotebookContentBlock): NotebookContentBlock {
  return normalizeSemanticTextFields(block) as NotebookContentBlock;
}

function normalizeFormulaLatex(text: string): string {
  return normalizeMathSource(text)
    .replace(/(?:\\{2,}|\s*\\)\s*$/g, '')
    .replace(/\s+$/g, '')
    .trim();
}

function stripEmptyDisplayMath(text: string): string {
  return text
    .replace(/^\s*\\{1,2}\[\s*\\{1,2}\]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isTrivialConnectorText(text: string): boolean {
  const normalized = text
    .trim()
    .replace(/[，,。.；;：:\s]+/g, '')
    .toLowerCase();
  return normalized === '且' || normalized === 'and';
}

function normalizeEquationBlock(block: Extract<NotebookContentBlock, { type: 'equation' }>) {
  const normalizedDelimiters = block.latex.replace(/\\\\(?=[a-zA-Z()[\]])/g, '\\').trim();
  const containsProse = /[\u3400-\u9fff]|[。！？；：]/.test(normalizedDelimiters);
  const containsInlineDelimiter = /\\\(|\\\[|\$\$?/.test(normalizedDelimiters);
  const textOnly = normalizedDelimiters.match(/^\\qquad\\text\{([^{}]+)\}\\qquad$/);

  if (textOnly?.[1]) {
    return [{ type: 'paragraph' as const, text: textOnly[1].trim() }];
  }

  if (containsProse && containsInlineDelimiter) {
    return [{ type: 'paragraph' as const, text: normalizedDelimiters }];
  }

  const latex = normalizeFormulaLatex(block.latex);
  return latex ? [{ ...block, latex }] : [];
}

function splitDetachedMathLines(text: string): { text: string; equations: string[] } {
  const proseLines: string[] = [];
  const equations: string[] = [];

  for (const line of stripEmptyDisplayMath(text).split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commandCount = (trimmed.match(/\\{1,2}[a-zA-Z]+/g) || []).length;
    const looksLikeDetachedMath =
      commandCount >= 2 &&
      (/\\{1,2}(to|forall|exists|in|subseteq|Rightarrow|land|begin|end|qquad)/.test(trimmed) ||
        /^[A-Za-z0-9_{}\\()[\],.:;+\-=\s^!]+$/.test(trimmed));

    if (looksLikeDetachedMath) {
      equations.push(normalizeMathSource(trimmed.replace(/^\\\[/, '').replace(/\\\]$/, '')));
    } else {
      proseLines.push(trimmed);
    }
  }

  return { text: proseLines.join('\n'), equations };
}

function normalizeSemanticDocumentMath(document: NotebookContentDocument): NotebookContentDocument {
  const normalizeBlocks = (blocks: NotebookContentBlock[]): NotebookContentBlock[] =>
    blocks.flatMap((block): NotebookContentBlock[] => {
      const normalizedBlock = normalizeBlockTextFields(block);
      if (normalizedBlock.type === 'equation') return normalizeEquationBlock(normalizedBlock);
      if (normalizedBlock.type === 'derivation_steps') {
        return [
          {
            ...normalizedBlock,
            steps: normalizedBlock.steps.map((step) =>
              step.format === 'latex'
                ? { ...step, expression: normalizeFormulaLatex(step.expression) }
                : step,
            ),
          },
        ];
      }
      if (normalizedBlock.type === 'paragraph' && isTrivialConnectorText(normalizedBlock.text)) {
        return [];
      }
      if (normalizedBlock.type !== 'definition' && normalizedBlock.type !== 'theorem') {
        return [normalizedBlock];
      }
      const split = splitDetachedMathLines(normalizedBlock.text);
      const normalizedBlocks: NotebookContentBlock[] = split.text
        ? [{ ...normalizedBlock, text: split.text }]
        : [];
      normalizedBlocks.push(
        ...split.equations.map(
          (latex): NotebookContentBlock => ({ type: 'equation', latex, display: true }),
        ),
      );
      return normalizedBlocks;
    });

  const blocks = normalizeBlocks(document.blocks);
  const slots = document.slots?.map((slot) => ({
    ...slot,
    blocks: normalizeBlocks(slot.blocks),
  }));
  const hasDefinition = blocks.some(
    (block) => block.type === 'definition' || block.type === 'theorem',
  );
  const hasFormula = blocks.some((block) => block.type === 'equation' || block.type === 'matrix');
  const hasProcessFlow = blocks.some((block) => block.type === 'process_flow');
  const shouldAvoidCoverHero =
    document.layoutTemplate === 'cover_hero' && hasProcessFlow && blocks.length <= 3;
  const layoutTemplate = shouldAvoidCoverHero
    ? 'title_content'
    : document.layoutTemplate === 'title_content' && hasDefinition && hasFormula
      ? 'definition_board'
      : document.layoutTemplate;

  return {
    ...document,
    blocks,
    ...(slots ? { slots } : {}),
    ...(layoutTemplate ? { layoutTemplate } : {}),
    ...(shouldAvoidCoverHero ? { layoutFamily: 'concept_cards' as const } : {}),
    ...(layoutTemplate === 'definition_board' || layoutTemplate === 'concept_map'
      ? { layoutFamily: 'concept_cards' as const, archetype: 'definition' as const }
      : {}),
  };
}

export function markSemanticSlideContent(
  content: SlideContent,
  options?: { renderMode?: 'auto' | 'manual' },
): SlideContent {
  if (!content.semanticDocument) return content;
  return renderSemanticSlideContent({
    document: content.semanticDocument,
    fallbackTitle: content.semanticDocument.title || '',
    preserveCanvasId: content.canvas.id,
    syntaraMarkup: content.syntaraMarkup,
    renderMode: options?.renderMode ?? content.semanticRenderMode ?? 'auto',
  });
}

export function renderSemanticSlideContent(args: {
  document: NotebookContentDocument;
  fallbackTitle: string;
  preserveCanvasId?: string;
  syntaraMarkup?: string;
  renderMode?: 'auto' | 'manual';
}): SlideContent {
  const document = normalizeSemanticDocumentMath(args.document);
  const renderedCanvas = renderNotebookContentDocumentToSlide({
    document,
    fallbackTitle: args.fallbackTitle,
  });
  const layoutValidation = validateSlideTextLayout(renderedCanvas.elements);
  const normalizedCanvas = layoutValidation.isValid
    ? renderedCanvas
    : {
        ...renderedCanvas,
        elements: normalizeSlideTextLayout(renderedCanvas.elements),
      };
  const canvas: Slide = args.preserveCanvasId
    ? {
        ...normalizedCanvas,
        id: args.preserveCanvasId,
      }
    : normalizedCanvas;

  return {
    type: 'slide',
    canvas,
    syntaraMarkup: args.syntaraMarkup,
    semanticDocument: document,
    semanticRenderVersion: SEMANTIC_SLIDE_RENDER_VERSION,
    semanticRenderMode: args.renderMode ?? 'auto',
    webRenderMode: args.renderMode === 'manual' ? 'slide' : 'scroll',
  };
}

export function shouldAutoRefreshSemanticSlideContent(content: SlideContent): boolean {
  if (!content.semanticDocument) return false;
  if (hasMathRenderError(content)) return true;
  if (content.semanticRenderMode === 'manual') return false;
  return content.semanticRenderVersion !== SEMANTIC_SLIDE_RENDER_VERSION;
}

function hasMathRenderError(content: SlideContent): boolean {
  const elementsJson = JSON.stringify(content.canvas.elements ?? []);
  return /katex-error|KaTeX parse error|ParseError: KaTeX/.test(elementsJson);
}

export function refreshSemanticSlideScene(scene: Scene): Scene {
  if (scene.type !== 'slide' || scene.content.type !== 'slide') {
    return scene;
  }

  const { content } = scene;
  if (!shouldAutoRefreshSemanticSlideContent(content) || !content.semanticDocument) {
    return scene;
  }
  const markupSource = content.syntaraMarkup;
  const shouldCompileFromMarkup = Boolean(markupSource && !content.semanticDocument.continuation);
  const sourceDocument = shouldCompileFromMarkup
    ? compileSyntaraMarkupToNotebookDocument(markupSource || '', {
        title: content.semanticDocument.title || scene.title,
        language: content.semanticDocument.language,
      }) || normalizeSemanticDocumentMath(content.semanticDocument)
    : normalizeSemanticDocumentMath(content.semanticDocument);
  const syntaraMarkup = shouldCompileFromMarkup
    ? normalizeSyntaraMarkupLayout(markupSource || '')
    : markupSource;

  return {
    ...scene,
    content: renderSemanticSlideContent({
      document: sourceDocument,
      fallbackTitle: sourceDocument.title || scene.title,
      preserveCanvasId: content.canvas.id,
      syntaraMarkup,
      renderMode: content.semanticRenderMode ?? 'auto',
    }),
  };
}
