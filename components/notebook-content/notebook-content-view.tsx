'use client';

import katex from 'katex';
import { memo } from 'react';
import type { BundledLanguage } from 'shiki';
import { cn } from '@/lib/utils';
import { getDirectUnicodeMathSymbol, normalizeLatexSource } from '@/lib/latex-utils';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import { chemistryTextToHtml } from '@/lib/notebook-content';
import { matrixBlockToLatex } from '@/lib/notebook-content/block-utils';

interface NotebookContentViewProps {
  document: NotebookContentDocument;
  className?: string;
}

function FormulaBlock({ latex, display = true }: { latex: string; display?: boolean }) {
  const normalizedLatex = normalizeLatexSource(latex);
  const directSymbol = getDirectUnicodeMathSymbol(normalizedLatex);
  const html =
    directSymbol ??
    katex.renderToString(normalizedLatex, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
      strict: 'ignore',
    });
  return <div className="[&_.katex-display]:my-1" dangerouslySetInnerHTML={{ __html: html }} />;
}

export const NotebookContentView = memo(function NotebookContentView({
  document,
  className,
}: NotebookContentViewProps) {
  return (
    <div className={cn('space-y-3 text-sm text-foreground', className)}>
      {document.blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return (
              <h3
                key={index}
                className={cn(
                  'font-semibold tracking-tight',
                  block.level <= 1 ? 'text-xl' : block.level === 2 ? 'text-lg' : 'text-base',
                )}
              >
                {block.text}
              </h3>
            );
          case 'paragraph':
            return (
              <p key={index} className="whitespace-pre-wrap leading-7 text-foreground">
                {block.text}
              </p>
            );
          case 'bullet_list':
            return (
              <ul key={index} className="list-disc space-y-1 pl-5 text-foreground">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="whitespace-pre-wrap leading-7">
                    {item}
                  </li>
                ))}
              </ul>
            );
          case 'equation':
            return (
              <div key={index} className="space-y-1">
                <FormulaBlock latex={block.latex} display={block.display} />
                {block.caption ? (
                  <p className="text-xs text-muted-foreground">{block.caption}</p>
                ) : null}
              </div>
            );
          case 'matrix':
            return (
              <div
                key={index}
                className="space-y-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
              >
                {block.label ? (
                  <p className="text-sm font-medium text-foreground">{block.label}</p>
                ) : null}
                <FormulaBlock latex={matrixBlockToLatex(block)} display />
                {block.caption ? (
                  <p className="text-xs text-muted-foreground">{block.caption}</p>
                ) : null}
              </div>
            );
          case 'derivation_steps':
            return (
              <div key={index} className="space-y-2">
                {block.title ? <p className="font-medium text-foreground">{block.title}</p> : null}
                {block.steps.map((step, stepIdx) => (
                  <div
                    key={stepIdx}
                    className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {document.language === 'en-US'
                        ? `Step ${stepIdx + 1}`
                        : `步骤 ${stepIdx + 1}`}
                    </p>
                    {step.format === 'latex' ? (
                      <FormulaBlock latex={step.expression} display />
                    ) : step.format === 'chem' ? (
                      <p
                        className="text-base text-foreground"
                        dangerouslySetInnerHTML={{ __html: chemistryTextToHtml(step.expression) }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap leading-7 text-foreground">
                        {step.expression}
                      </p>
                    )}
                    {step.explanation ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {step.explanation}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          case 'code_block':
            {
              const codeLanguage = (block.language || 'text') as BundledLanguage;
              return (
                <div key={index} className="space-y-2">
                  {block.caption ? (
                    <p className="text-xs font-medium text-muted-foreground">{block.caption}</p>
                  ) : null}
                  <CodeBlock code={block.code} language={codeLanguage}>
                    <CodeBlockCopyButton />
                  </CodeBlock>
                </div>
              );
            }
          case 'code_walkthrough':
            {
              const codeLanguage = (block.language || 'text') as BundledLanguage;
              const outputLanguage = 'text' as BundledLanguage;
              return (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3"
                >
                  {block.title ? (
                    <p className="text-sm font-semibold text-foreground">{block.title}</p>
                  ) : null}
                  {block.caption ? (
                    <p className="text-xs font-medium text-muted-foreground">{block.caption}</p>
                  ) : null}
                  <CodeBlock code={block.code} language={codeLanguage}>
                    <CodeBlockCopyButton />
                  </CodeBlock>
                  <div className="space-y-2">
                    {block.steps.map((step, stepIdx) => (
                      <div
                        key={stepIdx}
                        className="rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {document.language === 'en-US'
                            ? `Step ${stepIdx + 1}`
                            : `步骤 ${stepIdx + 1}`}
                          {step.title || step.focus ? ` · ${step.title || step.focus}` : ''}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {step.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                  {block.output ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {document.language === 'en-US' ? 'Output' : '输出'}
                      </p>
                      <CodeBlock code={block.output} language={outputLanguage}>
                        <CodeBlockCopyButton />
                      </CodeBlock>
                    </div>
                  ) : null}
                </div>
              );
            }
          case 'table': {
            const headers =
              block.headers && block.headers.length > 0
                ? block.headers
                : block.rows[0]?.map((_, idx) =>
                    document.language === 'en-US' ? `Column ${idx + 1}` : `列 ${idx + 1}`,
                  ) || [];
            return (
              <div key={index} className="space-y-2 overflow-x-auto">
                {block.caption ? (
                  <p className="text-xs font-medium text-muted-foreground">{block.caption}</p>
                ) : null}
                <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {headers.map((header, headerIdx) => (
                        <th key={headerIdx} className="px-3 py-2 font-semibold text-foreground">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/60">
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="px-3 py-2 align-top text-foreground">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'callout': {
            const toneClass = {
              info: 'border-blue-200 bg-blue-50/70 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100',
              success:
                'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100',
              warning:
                'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100',
              danger:
                'border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100',
              tip: 'border-violet-200 bg-violet-50/80 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-100',
            }[block.tone];
            return (
              <div key={index} className={cn('rounded-xl border px-3 py-2.5', toneClass)}>
                {block.title ? <p className="mb-1 text-sm font-semibold">{block.title}</p> : null}
                <p className="whitespace-pre-wrap leading-7">{block.text}</p>
              </div>
            );
          }
          case 'example':
            return (
              <div key={index} className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  {block.title || (document.language === 'en-US' ? 'Worked Example' : '例题讲解')}
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-7 text-foreground">
                  {block.problem}
                </p>
                {block.givens.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground">
                    {block.givens.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {block.goal ? (
                  <p className="mt-2 text-sm text-muted-foreground">{block.goal}</p>
                ) : null}
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-foreground">
                  {block.steps.map((step, stepIdx) => (
                    <li key={stepIdx} className="whitespace-pre-wrap leading-7">
                      {step}
                    </li>
                  ))}
                </ol>
                {block.answer ? (
                  <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {document.language === 'en-US' ? 'Answer: ' : '答案：'}
                    {block.answer}
                  </p>
                ) : null}
                {block.pitfalls.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {block.pitfalls.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          case 'chem_formula':
            return (
              <div key={index} className="space-y-1">
                <p
                  className="text-base text-foreground"
                  dangerouslySetInnerHTML={{ __html: chemistryTextToHtml(block.formula) }}
                />
                {block.caption ? (
                  <p className="text-xs text-muted-foreground">{block.caption}</p>
                ) : null}
              </div>
            );
          case 'chem_equation':
            return (
              <div key={index} className="space-y-1">
                <p
                  className="text-base text-foreground"
                  dangerouslySetInnerHTML={{ __html: chemistryTextToHtml(block.equation) }}
                />
                {block.caption ? (
                  <p className="text-xs text-muted-foreground">{block.caption}</p>
                ) : null}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});
