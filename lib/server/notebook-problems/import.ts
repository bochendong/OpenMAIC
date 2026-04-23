import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { ZodError } from 'zod';
import { callLLM } from '@/lib/ai/llm';
import {
  notebookProblemImportDraftSchema,
  type NotebookProblemImportDraft,
  type NotebookProblemSource,
} from '@/lib/problem-bank';
import { estimateOpenAITextUsageRetailCostCredits } from '@/lib/utils/openai-pricing';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

const MATH_SYMBOL_PATTERN = /[=<>≤≥∈∉⊆⊂⊇⊃∪∩∅∀∃∑∏√∞±×÷→↔⇒⇔]/;

function detectTextLocale(text: string): 'zh-CN' | 'en-US' {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function replaceLatexDelimiters(text: string): string {
  return text
    .replace(/\\\[((?:[\s\S]+?))\\\]/g, (_, expr: string) => `$$${expr.trim()}$$`)
    .replace(/\\\(((?:[\s\S]+?))\\\)/g, (_, expr: string) => `$$${expr.trim()}$$`)
    .replace(/\$([^$\n]+?)\$/g, (_, expr: string) => `$$${expr.trim()}$$`);
}

function isLikelyStandaloneMathLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('$$') || trimmed.includes('```')) return false;
  const longWords = trimmed.match(/[A-Za-z]{4,}/g)?.length ?? 0;
  const mathHits = trimmed.match(/[=<>≤≥∈∉⊆⊂⊇⊃∪∩∅∀∃∑∏√∞±×÷→↔⇒⇔]/g)?.length ?? 0;
  return (
    mathHits > 0 &&
    longWords <= 4 &&
    (/^[A-Za-z0-9({[\\]/.test(trimmed) ||
      /\b[A-Za-z]\s*=\s*[\[{(]/.test(trimmed) ||
      /\b[A-Za-z]\s*[⊆⊂⊇⊃=]\s*[A-Za-z]/.test(trimmed))
  );
}

function isLikelyInlineMathExpression(fragment: string): boolean {
  const trimmed = fragment.trim();
  if (!trimmed || trimmed.startsWith('$$') || trimmed.endsWith('$$')) return false;
  if (!MATH_SYMBOL_PATTERN.test(trimmed)) return false;
  const longWords = trimmed.match(/[A-Za-z]{4,}/g)?.length ?? 0;
  return longWords <= 3;
}

function wrapInlineMathExpressions(text: string): string {
  const parts = text.split(/(\$\$[\s\S]+?\$\$)/g);
  return parts
    .map((part) => {
      if (part.startsWith('$$') && part.endsWith('$$')) return part;
      return part.replace(
        /(^|[\s(（\[【:：,，])([A-Za-z0-9\\][^。\n！？!?;；,，]*?[=<>≤≥∈∉⊆⊂⊇⊃∪∩∅∀∃∑∏√∞±×÷→↔⇒⇔][^。\n！？!?;；,，]*?)(?=($|[\s)）\]】,，。！？!?;；]))/g,
        (match, prefix: string, expr: string, suffix: string) => {
          if (!isLikelyInlineMathExpression(expr)) return match;
          return `${prefix}$$${normalizeWhitespace(expr)}$$${suffix}`;
        },
      );
    })
    .join('');
}

function normalizeMathMarkdown(text: string): string {
  const withLatexDelimiters = replaceLatexDelimiters(text);
  const withDisplayLines = withLatexDelimiters
    .split('\n')
    .map((line) => {
      if (isLikelyStandaloneMathLine(line)) {
        return `$$${line.trim()}$$`;
      }
      return line;
    })
    .join('\n');
  return wrapInlineMathExpressions(withDisplayLines)
    .replace(/\$\$\s+/g, '$$')
    .replace(/\s+\$\$/g, '$$');
}

function stripMathForTitle(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\\\[((?:[\s\S]+?))\\\]/g, ' ')
      .replace(/\\\(((?:[\s\S]+?))\\\)/g, ' ')
      .replace(/\$\$[\s\S]+?\$\$/g, ' ')
      .replace(/\$[^$\n]+?\$/g, ' ')
      .replace(/(?:^|\n)\s*[A-H][\.\):：].+/g, ' ')
      .replace(/(?:^|\n)\s*(?:答案|Answer)\s*[:：].+/gi, ' ')
      .replace(/[_*`#>-]+/g, ' '),
  );
}

function inferTopicLabel(text: string, locale: 'zh-CN' | 'en-US'): string {
  if (/(集合|set|subset|superset|⊆|⊂|∈|∩|∪)/i.test(text)) {
    if (/(线性组合|linear combination|整数|integer|x,y∈|n∈)/i.test(text)) {
      return locale === 'zh-CN' ? '线性组合集合' : 'Linear Combination Sets';
    }
    if (/(相等|相同|equal|equality)/i.test(text)) {
      return locale === 'zh-CN' ? '集合相等' : 'Set Equality';
    }
    if (/(交|并|差|intersection|union|difference)/i.test(text)) {
      return locale === 'zh-CN' ? '集合运算' : 'Set Operations';
    }
    return locale === 'zh-CN' ? '集合问题' : 'Set Theory';
  }
  if (/(递归|recursion)/i.test(text)) return locale === 'zh-CN' ? '递归' : 'Recursion';
  if (/(矩阵|matrix)/i.test(text)) return locale === 'zh-CN' ? '矩阵' : 'Matrices';
  if (/(导数|derivative|integral|积分)/i.test(text))
    return locale === 'zh-CN' ? '微积分' : 'Calculus';
  if (/(概率|probability|随机)/i.test(text)) return locale === 'zh-CN' ? '概率' : 'Probability';
  if (/(图|graph|tree|binary tree)/i.test(text))
    return locale === 'zh-CN' ? '图与树' : 'Graphs and Trees';
  if (/(字符串|string|array|数组|链表|linked list)/i.test(text))
    return locale === 'zh-CN' ? '数据结构' : 'Data Structures';
  return locale === 'zh-CN' ? '课程题目' : 'Course Problem';
}

function inferTaskLabel(
  text: string,
  type: NotebookProblemImportDraft['type'],
  locale: 'zh-CN' | 'en-US',
): string {
  if (/(⊆|⊂|包含|subset|superset|contain)/i.test(text)) {
    return locale === 'zh-CN' ? '包含关系' : 'Inclusion';
  }
  if (/(相等|相同|equal|equality)/i.test(text)) {
    return locale === 'zh-CN' ? '相等判断' : 'Equality';
  }
  if (type === 'proof') return locale === 'zh-CN' ? '证明' : 'Proof';
  if (type === 'calculation') return locale === 'zh-CN' ? '计算' : 'Calculation';
  if (type === 'choice') return locale === 'zh-CN' ? '选择题' : 'Multiple Choice';
  if (type === 'fill_blank') return locale === 'zh-CN' ? '填空' : 'Fill Blank';
  if (type === 'code') return locale === 'zh-CN' ? 'Python 编程' : 'Python Coding';
  return locale === 'zh-CN' ? '简答' : 'Short Answer';
}

function deriveProblemTitle(text: string, type: NotebookProblemImportDraft['type']): string {
  const locale = detectTextLocale(text);
  const plain = stripMathForTitle(text);
  const clauses = plain
    .split(/[\n。！？!?;；]/)
    .map((part) =>
      normalizeWhitespace(
        part
          .replace(/^(?:\d+[\.\)]\s*)+/, '')
          .replace(/^(?:设|已知|对于|给定|考虑|请|试|证明|计算|求|写出|判断|说明)\s*/i, '')
          .replace(
            /^(?:consider|given|let|show that|prove that|determine whether|find|compute|calculate|write)\s+/i,
            '',
          ),
      ),
    )
    .filter(Boolean);

  for (const clause of clauses) {
    if (clause.length >= 4 && clause.length <= 36 && !/^[A-Z](?:\s+[A-Z])+$/.test(clause)) {
      return clause.slice(0, 36);
    }
  }

  const topic = inferTopicLabel(text, locale);
  const task = inferTaskLabel(text, type, locale);
  if (locale === 'zh-CN') {
    return task === '选择题' || task === '填空' ? `${topic}${task}` : `${topic}的${task}`;
  }
  return task === 'Multiple Choice' || task === 'Fill Blank'
    ? `${topic} ${task}`
    : `${task} of ${topic}`;
}

function isWeakProblemTitle(title: string, type: NotebookProblemImportDraft['type']): boolean {
  const singleLine = normalizeWhitespace(title);
  if (!singleLine) return true;
  if (singleLine.length > 48) return true;
  if (/^(untitled problem|imported problem|未命名题目|题目)$/i.test(singleLine)) return true;
  if (MATH_SYMBOL_PATTERN.test(singleLine)) return true;
  if (
    /^(证明|计算|求|判断|说明|show that|prove that|find|compute|calculate|determine)\b/i.test(
      singleLine,
    )
  ) {
    return true;
  }
  if (type === 'choice' && /^(选项|choice|multiple choice)$/i.test(singleLine)) return true;
  return false;
}

function normalizeTitle(
  text: string,
  type: NotebookProblemImportDraft['type'] = 'short_answer',
): string {
  const singleLine = normalizeWhitespace(text);
  if (isWeakProblemTitle(singleLine, type)) {
    return deriveProblemTitle(text, type).slice(0, 80) || 'Untitled problem';
  }
  return singleLine.slice(0, 80) || 'Untitled problem';
}

function inferDifficulty(text: string): 'easy' | 'medium' | 'hard' {
  if (/证明|prove|严格|递归|复杂度|hard|困难/i.test(text)) return 'hard';
  if (/计算|derive|multiple|fill in|填空|code|python/i.test(text)) return 'medium';
  return 'easy';
}

function inferType(block: string): NotebookProblemImportDraft['type'] {
  if (/```|python|def\s+\w+\s*\(|class\s+\w+\s*\(|public test|secret test|leetcode/i.test(block)) {
    return 'code';
  }
  if (/____|填空|blank/i.test(block)) return 'fill_blank';
  if (/证明|prove/i.test(block)) return 'proof';
  if (/计算|calculate|求值|求解|evaluate/i.test(block)) return 'calculation';
  if (/(?:^|\n)\s*[A-D][\.\):：]/m.test(block)) return 'choice';
  return 'short_answer';
}

function parseChoiceOptions(block: string) {
  const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-H])[\.\):：]\s*(.+)/g)];
  return optionMatches.map((match) => ({
    id: match[1],
    label: match[2].trim(),
  }));
}

function extractChoiceAnswer(block: string): string[] {
  const explicit = block.match(/(?:答案|Answer)\s*[:：]\s*([A-H](?:\s*[,，/]\s*[A-H])*)/i);
  if (!explicit) return [];
  return explicit[1]
    .split(/[,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCodeSignature(block: string): string | undefined {
  const match = block.match(/def\s+\w+\s*\([^\)]*\)/);
  return match?.[0]?.trim();
}

function extractPublicTests(block: string) {
  const tests = [
    ...block.matchAll(/(?:public test|测试用例|sample)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi),
  ];
  return tests.map((match, index) => ({
    id: `public_${index + 1}`,
    description: `Public test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

function extractSecretTests(block: string) {
  const tests = [...block.matchAll(/(?:secret test|隐藏测试)\s*[:：]?\s*(.+?)\s*=>\s*(.+)/gi)];
  return tests.map((match, index) => ({
    id: `secret_${index + 1}`,
    description: `Secret test ${index + 1}`,
    expression: match[1].trim(),
    expected: match[2].trim(),
  }));
}

function buildHeuristicDraft(
  block: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft | null {
  const cleaned = block.trim();
  if (!cleaned) return null;

  const type = inferType(cleaned);
  const title = normalizeTitle(cleaned, type);
  const common = {
    draftId: randomUUID(),
    title,
    status: 'draft' as const,
    source,
    points: 1,
    tags: [],
    difficulty: inferDifficulty(cleaned),
    sourceMeta: {
      importMode: 'heuristic',
      rawBlock: cleaned,
    },
    validationErrors: [] as string[],
  };

  if (type === 'choice') {
    const options = parseChoiceOptions(cleaned);
    const correctOptionIds = extractChoiceAnswer(cleaned);
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned.replace(/(?:^|\n)\s*[A-H][\.\):：].+/g, '').trim()),
        selectionMode: correctOptionIds.length > 1 ? 'multiple' : 'single',
        options: options.map((option) => ({
          ...option,
          label: normalizeMathMarkdown(option.label),
        })),
      },
      grading: {
        type,
        correctOptionIds,
      },
      validationErrors: [
        ...(options.length < 2 ? ['未识别到足够的选项'] : []),
        ...(correctOptionIds.length === 0 ? ['未识别到正确答案'] : []),
      ],
    });
  }

  if (type === 'proof') {
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned),
      },
      grading: {
        type,
      },
    });
  }

  if (type === 'calculation') {
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned),
      },
      grading: {
        type,
        acceptedForms: [],
      },
      validationErrors: ['需补充 accepted answer 或 tolerance'],
    });
  }

  if (type === 'fill_blank') {
    const blanks = [...cleaned.matchAll(/_{3,}/g)].map((_, index) => ({
      id: `blank_${index + 1}`,
      placeholder: `Blank ${index + 1}`,
    }));
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stemTemplate: normalizeMathMarkdown(cleaned),
        blanks,
      },
      grading: {
        type,
        blanks: blanks.map((blank) => ({
          id: blank.id,
          acceptedAnswers: [],
          caseSensitive: false,
        })),
      },
      validationErrors: ['需补充每个空的 accepted answers'],
    });
  }

  if (type === 'code') {
    const publicTests = extractPublicTests(cleaned);
    const secretTests = extractSecretTests(cleaned);
    return notebookProblemImportDraftSchema.parse({
      ...common,
      type,
      publicContent: {
        type,
        stem: normalizeMathMarkdown(cleaned),
        language: 'python',
        starterCode: undefined,
        functionSignature: extractCodeSignature(cleaned),
        constraints: [],
        publicTests,
        sampleIO: [],
        secretConfigPresent: secretTests.length > 0,
      },
      grading: {
        type,
        publishRequirementsMet:
          Boolean(extractCodeSignature(cleaned)) &&
          publicTests.length > 0 &&
          secretTests.length > 0,
      },
      secretJudge:
        secretTests.length > 0
          ? {
              language: 'python',
              secretTests,
              timeoutMs: 5000,
            }
          : undefined,
      validationErrors: [
        ...(extractCodeSignature(cleaned) ? [] : ['缺少 function signature']),
        ...(publicTests.length > 0 ? [] : ['缺少 public tests']),
        ...(secretTests.length > 0 ? [] : ['缺少 secret tests']),
      ],
    });
  }

  return notebookProblemImportDraftSchema.parse({
    ...common,
    type: 'short_answer',
    publicContent: {
      type: 'short_answer',
      stem: normalizeMathMarkdown(cleaned),
    },
    grading: {
      type: 'short_answer',
    },
  });
}

function heuristicExtractProblemDrafts(
  text: string,
  source: NotebookProblemSource,
): NotebookProblemImportDraft[] {
  const blocks = text
    .split(
      /\n(?=(?:\d+[\.\)]\s+|Q\d+[:.]|Question\s+\d+|题目\s*\d+|题\s*\d+[：:]|选择题|证明题|代码题|填空题|简答题|计算题))/,
    )
    .map((block) => block.trim())
    .filter(Boolean);
  const candidates = blocks.length > 0 ? blocks : [text.trim()];
  return candidates
    .map((block) => buildHeuristicDraft(block, source))
    .filter(Boolean) as NotebookProblemImportDraft[];
}

function normalizeRubricValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const criterion =
          'criterion' in item && typeof item.criterion === 'string' ? item.criterion.trim() : '';
        const points =
          'points' in item && typeof item.points === 'number' && Number.isFinite(item.points)
            ? item.points
            : null;
        if (criterion && points != null) return `${criterion}（${points} 分）`;
        if (criterion) return criterion;
      }
      return String(item ?? '').trim();
    })
    .filter(Boolean)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
}

function pickFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function looksLikeSingleProblemInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return heuristicExtractProblemDrafts(trimmed, 'manual').length === 1;
}

function normalizeRawCandidate(
  raw: unknown,
  source: NotebookProblemSource,
): Record<string, unknown> {
  const base =
    typeof raw === 'object' && raw
      ? ({ ...raw } as Record<string, unknown>)
      : ({ title: String(raw ?? '') } as Record<string, unknown>);
  const type = typeof base.type === 'string' ? base.type : 'short_answer';

  const publicContent =
    typeof base.publicContent === 'object' && base.publicContent
      ? ({ ...(base.publicContent as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  publicContent.type = type;

  const grading =
    typeof base.grading === 'object' && base.grading
      ? ({ ...(base.grading as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  grading.type = type;

  if (
    publicContent.stem == null &&
    pickFirstString(
      publicContent.stem,
      publicContent.statement,
      publicContent.question,
      publicContent.prompt,
      publicContent.description,
      base.stem,
      base.statement,
      base.question,
      base.prompt,
      base.description,
    ) &&
    (type === 'short_answer' ||
      type === 'choice' ||
      type === 'proof' ||
      type === 'calculation' ||
      type === 'code')
  ) {
    publicContent.stem = pickFirstString(
      publicContent.stem,
      publicContent.statement,
      publicContent.question,
      publicContent.prompt,
      publicContent.description,
      base.stem,
      base.statement,
      base.question,
      base.prompt,
      base.description,
    );
  }

  if (typeof publicContent.stem === 'string') {
    publicContent.stem = normalizeMathMarkdown(publicContent.stem);
  }

  if (
    publicContent.stemTemplate == null &&
    pickFirstString(
      publicContent.stemTemplate,
      publicContent.statement,
      publicContent.question,
      base.stemTemplate,
      base.statement,
      base.question,
    ) &&
    type === 'fill_blank'
  ) {
    publicContent.stemTemplate = pickFirstString(
      publicContent.stemTemplate,
      publicContent.statement,
      publicContent.question,
      base.stemTemplate,
      base.statement,
      base.question,
    );
  }

  if (typeof publicContent.stemTemplate === 'string') {
    publicContent.stemTemplate = normalizeMathMarkdown(publicContent.stemTemplate);
  }

  if (
    type === 'choice' &&
    (!Array.isArray(publicContent.options) || publicContent.options.length === 0) &&
    Array.isArray(base.options)
  ) {
    publicContent.options = base.options.map((option, index) => {
      if (typeof option === 'string') {
        return { id: String.fromCharCode(65 + index), label: option.trim() };
      }
      if (option && typeof option === 'object') {
        const id =
          pickFirstString(
            (option as { id?: unknown }).id,
            (option as { value?: unknown }).value,
            (option as { key?: unknown }).key,
          ) || String.fromCharCode(65 + index);
        const label =
          pickFirstString(
            (option as { label?: unknown }).label,
            (option as { text?: unknown }).text,
            (option as { value?: unknown }).value,
          ) || id;
        return { id, label };
      }
      return { id: String.fromCharCode(65 + index), label: String(option ?? '').trim() };
    });
  }

  if (Array.isArray(publicContent.options)) {
    publicContent.options = publicContent.options.map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String.fromCharCode(65 + index),
          label: normalizeMathMarkdown(option),
        };
      }
      if (!option || typeof option !== 'object') return option;
      const row = option as Record<string, unknown>;
      return {
        id: pickFirstString(row.id, row.value, row.key) || String.fromCharCode(65 + index),
        label: normalizeMathMarkdown(
          pickFirstString(row.label, row.text, row.value) || String.fromCharCode(65 + index),
        ),
      };
    });
  }

  if (Array.isArray(grading.rubric)) {
    grading.rubric = normalizeRubricValue(grading.rubric);
  }

  if (typeof publicContent.explanation === 'string') {
    publicContent.explanation = normalizeMathMarkdown(publicContent.explanation);
  }
  if (typeof grading.referenceAnswer === 'string') {
    grading.referenceAnswer = normalizeMathMarkdown(grading.referenceAnswer);
  }
  if (typeof grading.referenceProof === 'string') {
    grading.referenceProof = normalizeMathMarkdown(grading.referenceProof);
  }
  if (typeof grading.rubric === 'string') {
    grading.rubric = normalizeMathMarkdown(grading.rubric);
  }
  if (typeof grading.analysis === 'string') {
    grading.analysis = normalizeMathMarkdown(grading.analysis);
  }
  if (Array.isArray(grading.acceptedForms)) {
    grading.acceptedForms = grading.acceptedForms.map((item) =>
      typeof item === 'string' ? normalizeMathMarkdown(item) : item,
    );
  }

  if (type === 'short_answer' || type === 'calculation') {
    if (
      grading.referenceAnswer == null &&
      pickFirstString(
        grading.referenceAnswer,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { answer?: unknown }).answer,
        (base as { referenceAnswer?: unknown }).referenceAnswer,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      )
    ) {
      grading.referenceAnswer = pickFirstString(
        grading.referenceAnswer,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { answer?: unknown }).answer,
        (base as { referenceAnswer?: unknown }).referenceAnswer,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      );
    }
  }

  if (type === 'proof') {
    if (
      grading.referenceProof == null &&
      pickFirstString(
        grading.referenceProof,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { proof?: unknown }).proof,
        (base as { referenceProof?: unknown }).referenceProof,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      )
    ) {
      grading.referenceProof = pickFirstString(
        grading.referenceProof,
        (grading as { sampleAnswer?: unknown }).sampleAnswer,
        (grading as { proof?: unknown }).proof,
        (base as { referenceProof?: unknown }).referenceProof,
        (base as { sampleAnswer?: unknown }).sampleAnswer,
      );
    }
  }

  if (
    type === 'choice' &&
    (!Array.isArray(grading.correctOptionIds) || grading.correctOptionIds.length === 0)
  ) {
    const baseAnswers = Array.isArray((grading as { answer?: unknown[] }).answer)
      ? (grading as { answer: unknown[] }).answer
      : Array.isArray((base as { answer?: unknown[] }).answer)
        ? (base as { answer: unknown[] }).answer
        : [];
    grading.correctOptionIds = baseAnswers
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
  }

  if (type === 'short_answer' || type === 'proof') {
    if (
      publicContent.explanation == null &&
      typeof grading.analysis === 'string' &&
      grading.analysis.trim()
    ) {
      publicContent.explanation = grading.analysis;
    }
  }

  return {
    source,
    draftId: randomUUID(),
    status: 'draft',
    points: 1,
    tags: [],
    difficulty: 'medium',
    sourceMeta: {},
    validationErrors: [],
    ...base,
    title: normalizeTitle(
      typeof base.title === 'string'
        ? base.title
        : pickFirstString(
            publicContent.stem,
            publicContent.stemTemplate,
            String(base.title ?? ''),
          ) || 'Untitled problem',
      type as NotebookProblemImportDraft['type'],
    ),
    publicContent,
    grading,
  };
}

function formatImportValidationIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'draft';
    if (issue.message === 'Invalid input') {
      return `字段 ${path} 结构不符合当前题型 schema`;
    }
    return `字段 ${path}: ${issue.message}`;
  });
}

function normalizeCandidateDraft(
  raw: unknown,
  source: NotebookProblemSource,
): NotebookProblemImportDraft {
  const parsed = notebookProblemImportDraftSchema.safeParse(normalizeRawCandidate(raw, source));
  if (parsed.success) return parsed.data;

  const fallbackText =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && raw && 'title' in raw
        ? String((raw as { title?: unknown }).title || '')
        : JSON.stringify(raw);

  return notebookProblemImportDraftSchema.parse({
    draftId: randomUUID(),
    title: normalizeTitle(fallbackText || 'Imported problem', 'short_answer'),
    type: 'short_answer',
    status: 'draft',
    source,
    points: 1,
    tags: [],
    difficulty: inferDifficulty(fallbackText),
    publicContent: {
      type: 'short_answer',
      stem: normalizeMathMarkdown(fallbackText || 'Imported problem'),
    },
    grading: {
      type: 'short_answer',
    },
    sourceMeta: {
      importMode: 'fallback',
      raw,
    },
    validationErrors: formatImportValidationIssues(parsed.error),
  });
}

async function llmExtractProblemDrafts(args: {
  text: string;
  source: NotebookProblemSource;
  model: LanguageModel;
  language: 'zh-CN' | 'en-US';
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const system =
    args.language === 'zh-CN'
      ? `你是大学课程题库抽取助手。请把输入材料拆成一组题目草稿，并返回严格 JSON 数组，不要返回 markdown。
每个数组元素都必须尽量贴近以下结构：
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "validationErrors": string[]
}
要求：
- 尽量把题目拆细，一题一个对象
- 不要把同一道证明题 / 同一道复合题硬拆成多条草稿，除非原文明确编号成独立小题，或这些小题本身就是彼此独立可作答的问题
- title 必须是简洁、稳定、概念导向的题目名，优先概括知识点与任务，不要直接复制整句题面，不要把公式原样塞进 title
- choice 题必须拆出 options 与 correctOptionIds
- code 题默认 language=python
- 如果 code 题缺少 function signature / public tests / secret tests，也要保留，但写入 validationErrors
- publicContent / grading 里的数学表达请使用 markdown 公式定界符 $$...$$ 包裹；choice 选项里的公式也一样
- 不要臆造过多答案；拿不准就留空并写 validationErrors`
      : `You are a university problem-bank extraction assistant. Convert the source material into an array of problem drafts and return strict JSON only.
Each item should follow this shape as closely as possible:
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "validationErrors": string[]
}
Requirements:
- split into one object per problem when possible
- do not split one proof / one compound problem into multiple drafts unless the source explicitly numbers them as separate questions or they can be solved independently
- title must be concise, concept-focused, and stable; summarize the topic/task instead of copying the whole stem, and avoid dumping raw formulas into the title
- choice problems must include options and correctOptionIds
- code problems default to python
- if code problems miss function signature / public tests / secret tests, keep them as drafts and add validationErrors
- use markdown math delimiters $$...$$ for mathematical expressions inside publicContent / grading text, including choice option labels
- avoid inventing answers; leave fields empty and record validationErrors instead`;

  const prompt = `${args.language === 'zh-CN' ? '来源类型' : 'Source'}: ${args.source}

${args.language === 'zh-CN' ? '原始材料' : 'Raw material'}:
${args.text}`.slice(0, 24000);

  const result = await callLLM(
    {
      model: args.model,
      system,
      prompt,
    },
    'problem-bank-import-preview',
  );
  const raw = stripCodeFences(result.text);
  const parsed = JSON.parse(raw) as unknown[];
  if (!Array.isArray(parsed)) {
    throw new Error('LLM import output is not an array');
  }
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const cachedInputTokens = result.usage.cachedInputTokens ?? 0;
  return {
    drafts: parsed.map((item) => normalizeCandidateDraft(item, args.source)),
    usage:
      inputTokens > 0 || outputTokens > 0
        ? {
            inputTokens,
            outputTokens,
            cachedInputTokens,
            estimatedCostCredits: estimateOpenAITextUsageRetailCostCredits({
              modelString:
                typeof args.model === 'object' && 'modelId' in args.model
                  ? String((args.model as { modelId?: unknown }).modelId ?? '')
                  : undefined,
              inputTokens,
              outputTokens,
              cachedInputTokens,
            }),
          }
        : null,
  };
}

export async function extractProblemDraftsFromText(args: {
  text: string;
  source: NotebookProblemSource;
  language: 'zh-CN' | 'en-US';
  model?: LanguageModel;
}): Promise<{
  drafts: NotebookProblemImportDraft[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    estimatedCostCredits: number | null;
  } | null;
}> {
  const trimmed = args.text.trim();
  if (!trimmed) return { drafts: [], usage: null };
  const heuristicDrafts = heuristicExtractProblemDrafts(trimmed, args.source);

  if (args.model) {
    try {
      const llmResult = await llmExtractProblemDrafts({
        text: trimmed,
        source: args.source,
        model: args.model,
        language: args.language,
      });
      if (llmResult.drafts.length > 0) {
        if (
          heuristicDrafts.length === 1 &&
          llmResult.drafts.length > 1 &&
          llmResult.drafts.some((draft) => draft.validationErrors.length > 0) &&
          looksLikeSingleProblemInput(trimmed)
        ) {
          return {
            drafts: heuristicDrafts,
            usage: llmResult.usage,
          };
        }
        return llmResult;
      }
    } catch {
      // fall back to heuristic extraction below
    }
  }

  return {
    drafts: heuristicDrafts,
    usage: null,
  };
}
