import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  parseNotebookContentDocument,
  renderNotebookContentDocumentToSlide,
  type NotebookContentDocument,
} from '@/lib/notebook-content';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import type { SlideContent } from '@/lib/types/stage';
import type {
  PPTElement,
  PPTShapeElement,
  PPTTextElement,
  PPTLatexElement,
} from '@/lib/types/slides';

const log = createLogger('Classroom Repair Slide Math API');

export const maxDuration = 180;

type RepairRequestBody = {
  sceneTitle?: string;
  language?: 'zh-CN' | 'en-US';
  content?: SlideContent;
};

type RepairResponsePayload = {
  sceneTitle?: string;
  document?: unknown;
};

type SlideRepairTextSummaryItem = {
  id: string;
  type: 'text';
  name: string;
  text: string;
  textType?: string;
};

type SlideRepairShapeTextSummaryItem = {
  id: string;
  type: 'shape_text';
  name: string;
  text: string;
};

type SlideRepairLatexSummaryItem = {
  id: string;
  type: 'latex';
  name: string;
  latex: string;
};

type SlideRepairSummaryItem =
  | SlideRepairTextSummaryItem
  | SlideRepairShapeTextSummaryItem
  | SlideRepairLatexSummaryItem;

function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"');
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n'),
  ).trim();
}

function summarizeTextElement(element: PPTTextElement): SlideRepairTextSummaryItem {
  return {
    id: element.id,
    type: 'text',
    name: element.name || '',
    textType: element.textType || '',
    text: htmlToPlainText(element.content).slice(0, 2000),
  };
}

function summarizeShapeText(element: PPTShapeElement): SlideRepairShapeTextSummaryItem {
  const text = element.text?.content ? htmlToPlainText(element.text.content) : '';
  return {
    id: element.id,
    type: 'shape_text',
    name: element.name || '',
    text: text.slice(0, 2000),
  };
}

function summarizeLatexElement(element: PPTLatexElement): SlideRepairLatexSummaryItem {
  return {
    id: element.id,
    type: 'latex',
    name: element.name || '',
    latex: element.latex,
  };
}

function summarizeElements(elements: PPTElement[]): SlideRepairSummaryItem[] {
  return elements
    .slice()
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .flatMap<SlideRepairSummaryItem>((element) => {
      if (element.type === 'text') return [summarizeTextElement(element)];
      if (element.type === 'latex') return [summarizeLatexElement(element)];
      if (element.type === 'shape' && element.text?.content?.trim())
        return [summarizeShapeText(element)];
      return [];
    })
    .filter((item) => {
      if (item.type === 'latex') return Boolean(item.latex.trim());
      return Boolean(item.text.trim());
    });
}

function buildSystemPrompt(language: 'zh-CN' | 'en-US') {
  if (language === 'zh-CN') {
    return `你是一个“课堂单页数学排版修复器”。

你的任务是修复一页课堂幻灯片里的数学记号与公式表达，让它们适合被结构化渲染。

要求：
- 只修复当前这一页，不要扩写成多页。
- 保留原页主题、结论、层次和大致信息量，不要引入新的知识点。
- 重点修复数学对象、映射、集合、等式、核、像、同余类、下标、上标等表达。
- 把真正的数学表达放进结构化公式块：
  - 单个或独立公式用 {"type":"equation","latex":"...","display":true}
  - 连续推导用 {"type":"derivation_steps", ...}
- 解释性语句、标题、小结保留为 heading / paragraph / bullet_list。
- 如果原文里只是把数学表达硬塞在句子里，请拆成“说明文字 + 公式块”，不要继续把复杂公式塞进 paragraph。
- 不要输出 markdown，不要输出解释，不要输出代码块，只输出 JSON。

数学修复示例：
- Z12 -> \\mathbb{Z}_{12}
- Z6 -> \\mathbb{Z}_{6}
- ker(φ) -> \\ker(\\varphi)
- im(φ) -> \\operatorname{im}(\\varphi)
- [x]12 -> [x]_{12}
- φ([x]12)=[2x]6 -> \\varphi([x]_{12}) = [2x]_{6}

输出 schema：
{
  "sceneTitle": "修复后的页标题",
  "document": {
    "version": 1,
    "language": "zh-CN",
    "title": "可选，通常与 sceneTitle 一致",
    "blocks": [
      { "type": "heading", "level": 2, "text": "..." },
      { "type": "paragraph", "text": "..." },
      { "type": "bullet_list", "items": ["..."] },
      { "type": "equation", "latex": "...", "display": true },
      {
        "type": "derivation_steps",
        "title": "可选",
        "steps": [{ "expression": "...", "format": "latex", "explanation": "可选" }]
      },
      {
        "type": "callout",
        "tone": "info" | "success" | "warning" | "danger" | "tip",
        "title": "可选",
        "text": "..."
      }
    ]
  }
}`;
  }

  return `You repair the mathematical notation of a single classroom slide.

Requirements:
- Repair this page only. Do not expand it into multiple pages.
- Preserve the original topic, meaning, and rough information density.
- Convert malformed mathematical notation into structured math blocks.
- Use equation blocks for standalone math and derivation_steps for multi-line reasoning.
- Keep prose as heading / paragraph / bullet_list.
- If a sentence contains a heavy formula, split it into prose plus a formula block.
- Output JSON only. No markdown. No commentary. No code fences.

Examples:
- Z12 -> \\mathbb{Z}_{12}
- ker(phi) -> \\ker(\\varphi)
- im(phi) -> \\operatorname{im}(\\varphi)
- [x]12 -> [x]_{12}

Output schema:
{
  "sceneTitle": "repaired page title",
  "document": {
    "version": 1,
    "language": "en-US",
    "title": "optional",
    "blocks": []
  }
}`;
}

function buildUserPrompt(args: {
  sceneTitle: string;
  language: 'zh-CN' | 'en-US';
  semanticDocument: NotebookContentDocument | null;
  content: SlideContent;
}): string {
  const elementsSummary = summarizeElements(args.content.canvas.elements);
  const semanticDocumentJson = args.semanticDocument
    ? JSON.stringify(args.semanticDocument, null, 2)
    : 'N/A';

  return [
    `Language: ${args.language}`,
    `Current page title: ${args.sceneTitle}`,
    '',
    'Existing semantic document (prefer repairing this when available):',
    semanticDocumentJson,
    '',
    'Current slide element summary (ordered top-to-bottom):',
    JSON.stringify(elementsSummary, null, 2),
    '',
    'Return a repaired NotebookContentDocument for this same page.',
    'Keep the page focused. Do not add unrelated examples or sections.',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, '/api/classroom/repair-slide-math', async () => {
    try {
      const body = (await req.json()) as RepairRequestBody;
      const content = body.content;
      if (!content || content.type !== 'slide') {
        return apiError('MISSING_REQUIRED_FIELD', 400, 'slide content is required');
      }

      const sceneTitle = body.sceneTitle?.trim() || 'Slide';
      const language = body.language === 'en-US' ? 'en-US' : 'zh-CN';
      const semanticDocument = parseNotebookContentDocument(content.semanticDocument);

      const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
        allowOpenAIModelOverride: true,
      });

      const system = buildSystemPrompt(language);
      const prompt = buildUserPrompt({
        sceneTitle,
        language,
        semanticDocument,
        content,
      });

      log.info(`Repairing slide math formatting [model=${modelString}]`);
      const result = await callLLM(
        {
          model,
          system,
          prompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'classroom-repair-slide-math',
      );

      const parsed = parseJsonResponse<RepairResponsePayload>(result.text);
      if (!parsed) {
        return apiError('PARSE_FAILED', 500, 'Failed to parse repaired slide response');
      }

      const document = parseNotebookContentDocument(parsed.document);
      if (!document) {
        return apiError(
          'PARSE_FAILED',
          500,
          'Model did not return a valid notebook content document',
        );
      }

      const repairedSceneTitle = parsed.sceneTitle?.trim() || document.title?.trim() || sceneTitle;
      const renderedSlide = renderNotebookContentDocumentToSlide({
        document: {
          ...document,
          title: document.title || repairedSceneTitle,
        },
        fallbackTitle: repairedSceneTitle,
      });

      const repairedContent: SlideContent = {
        type: 'slide',
        canvas: {
          ...renderedSlide,
          id: content.canvas.id,
          theme: content.canvas.theme,
          background: content.canvas.background,
        },
        semanticDocument: {
          ...document,
          title: document.title || repairedSceneTitle,
        },
      };

      return apiSuccess({
        sceneTitle: repairedSceneTitle,
        content: repairedContent,
      });
    } catch (error) {
      log.error('repair-slide-math route error:', error);
      return apiError(
        'INTERNAL_ERROR',
        500,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
