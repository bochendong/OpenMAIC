import { z } from 'zod';

export const notebookContentLanguageSchema = z.enum(['zh-CN', 'en-US']);

export const notebookContentHeadingBlockSchema = z.object({
  type: z.literal('heading'),
  level: z.number().int().min(1).max(4).default(2),
  text: z.string().trim().min(1).max(400),
});

export const notebookContentParagraphBlockSchema = z.object({
  type: z.literal('paragraph'),
  text: z.string().trim().min(1).max(6000),
});

export const notebookContentBulletListBlockSchema = z.object({
  type: z.literal('bullet_list'),
  items: z.array(z.string().trim().min(1).max(1000)).min(1).max(16),
});

export const notebookContentEquationBlockSchema = z.object({
  type: z.literal('equation'),
  latex: z.string().trim().min(1).max(4000),
  display: z.boolean().default(true),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentDerivationStepSchema = z.object({
  expression: z.string().trim().min(1).max(4000),
  format: z.enum(['latex', 'text', 'chem']).default('latex'),
  explanation: z.string().trim().max(1000).optional(),
});

export const notebookContentDerivationBlockSchema = z.object({
  type: z.literal('derivation_steps'),
  title: z.string().trim().max(300).optional(),
  steps: z.array(notebookContentDerivationStepSchema).min(1).max(16),
});

export const notebookContentCodeBlockSchema = z.object({
  type: z.literal('code_block'),
  language: z.string().trim().min(1).max(64).default('text'),
  code: z.string().min(1).max(20000),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentTableBlockSchema = z.object({
  type: z.literal('table'),
  caption: z.string().trim().max(300).optional(),
  headers: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
  rows: z
    .array(z.array(z.string().trim().max(2000)).min(1).max(12))
    .min(1)
    .max(24),
});

export const notebookContentCalloutBlockSchema = z.object({
  type: z.literal('callout'),
  tone: z.enum(['info', 'success', 'warning', 'danger', 'tip']).default('info'),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
});

export const notebookContentExampleBlockSchema = z.object({
  type: z.literal('example'),
  title: z.string().trim().max(200).optional(),
  problem: z.string().trim().min(1).max(6000),
  givens: z.array(z.string().trim().min(1).max(1000)).max(12).default([]),
  goal: z.string().trim().max(1000).optional(),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(16),
  answer: z.string().trim().max(2000).optional(),
  pitfalls: z.array(z.string().trim().min(1).max(1000)).max(12).default([]),
});

export const notebookContentChemFormulaBlockSchema = z.object({
  type: z.literal('chem_formula'),
  formula: z.string().trim().min(1).max(2000),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentChemEquationBlockSchema = z.object({
  type: z.literal('chem_equation'),
  equation: z.string().trim().min(1).max(4000),
  caption: z.string().trim().max(300).optional(),
});

export const notebookContentBlockSchema = z.discriminatedUnion('type', [
  notebookContentHeadingBlockSchema,
  notebookContentParagraphBlockSchema,
  notebookContentBulletListBlockSchema,
  notebookContentEquationBlockSchema,
  notebookContentDerivationBlockSchema,
  notebookContentCodeBlockSchema,
  notebookContentTableBlockSchema,
  notebookContentCalloutBlockSchema,
  notebookContentExampleBlockSchema,
  notebookContentChemFormulaBlockSchema,
  notebookContentChemEquationBlockSchema,
]);

export const notebookContentDocumentSchema = z.object({
  version: z.literal(1).default(1),
  language: notebookContentLanguageSchema.default('zh-CN'),
  title: z.string().trim().max(300).optional(),
  blocks: z.array(notebookContentBlockSchema).min(1).max(64),
});

export type NotebookContentLanguage = z.infer<typeof notebookContentLanguageSchema>;
export type NotebookContentHeadingBlock = z.infer<typeof notebookContentHeadingBlockSchema>;
export type NotebookContentParagraphBlock = z.infer<typeof notebookContentParagraphBlockSchema>;
export type NotebookContentBulletListBlock = z.infer<typeof notebookContentBulletListBlockSchema>;
export type NotebookContentEquationBlock = z.infer<typeof notebookContentEquationBlockSchema>;
export type NotebookContentDerivationBlock = z.infer<typeof notebookContentDerivationBlockSchema>;
export type NotebookContentCodeBlock = z.infer<typeof notebookContentCodeBlockSchema>;
export type NotebookContentTableBlock = z.infer<typeof notebookContentTableBlockSchema>;
export type NotebookContentCalloutBlock = z.infer<typeof notebookContentCalloutBlockSchema>;
export type NotebookContentExampleBlock = z.infer<typeof notebookContentExampleBlockSchema>;
export type NotebookContentChemFormulaBlock = z.infer<typeof notebookContentChemFormulaBlockSchema>;
export type NotebookContentChemEquationBlock = z.infer<typeof notebookContentChemEquationBlockSchema>;
export type NotebookContentBlock = z.infer<typeof notebookContentBlockSchema>;
export type NotebookContentDocument = z.infer<typeof notebookContentDocumentSchema>;

export function parseNotebookContentDocument(input: unknown): NotebookContentDocument | null {
  const parsed = notebookContentDocumentSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
