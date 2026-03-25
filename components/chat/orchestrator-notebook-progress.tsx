'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { NotebookGenerationProgress } from '@/lib/create/run-notebook-generation-task';
import { StepVisualizer } from '@/app/generation-preview/components/visualizers';
import { ALL_STEPS } from '@/app/generation-preview/types';

function progressToVisualizerStepId(p: NotebookGenerationProgress): string {
  if (p.stage === 'completed') return 'outline';
  switch (p.stage) {
    case 'preparing':
      return 'outline';
    case 'pdf-analysis':
      return 'pdf-analysis';
    case 'research':
      return 'web-search';
    case 'metadata':
      return 'agent-generation';
    case 'agents':
      return 'agent-generation';
    case 'outline':
      return 'outline';
    case 'scene':
      return 'slide-content';
    case 'saving':
      return 'actions';
    default:
      return 'outline';
  }
}

function progressMotionKey(p: NotebookGenerationProgress): string {
  if (p.stage === 'scene') {
    return `${p.stage}-${p.completed}`;
  }
  return p.stage;
}

export function OrchestratorNotebookProgressPanel({
  progress,
  className,
}: {
  progress: NotebookGenerationProgress;
  className?: string;
}) {
  const { t } = useI18n();
  const stepId = progressToVisualizerStepId(progress);
  const stepMeta = ALL_STEPS.find((s) => s.id === stepId);
  const title = stepMeta ? t(stepMeta.title) : progress.detail;
  const webSearchSources =
    progress.stage === 'research' && progress.sources?.length
      ? progress.sources.map((s) => ({ title: s.title, url: s.url }))
      : undefined;

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-900/[0.08] bg-white/85 px-3 py-3 shadow-sm dark:border-white/[0.1] dark:bg-black/35',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative flex h-[148px] w-full max-w-[200px] shrink-0 items-center justify-center sm:h-[160px] sm:max-w-[220px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={progressMotionKey(progress)}
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
              transition={{ duration: 0.38 }}
              className="flex w-full items-center justify-center"
            >
              <StepVisualizer
                stepId={stepId}
                outlines={[]}
                webSearchSources={webSearchSources}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{progress.detail}</p>
          {progress.stage === 'scene' ? (
            <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
              页面 {progress.completed + 1} / {progress.total}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
