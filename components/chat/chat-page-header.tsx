import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OrchestratorChildTaskView } from './chat-page-types';

export function NoCourseChatState() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 text-center">
      <BookOpen className="size-12 text-muted-foreground/40" strokeWidth={1.25} />
      <div className="max-w-md space-y-2">
        <p className="text-lg font-medium text-foreground">尚未选择课程</p>
        <p className="text-sm text-muted-foreground">
          请先从「我的课程」进入一门课，或从课堂返回以保留侧栏课程上下文，再使用聊天。
        </p>
      </div>
      <Button asChild variant="default" className="rounded-xl">
        <Link href="/my-courses">前往我的课程</Link>
      </Button>
    </div>
  );
}

export function ChatPageHeader({
  titleLine,
  mode,
  contactTaskHint,
  isCourseOrchestrator,
  orchestratorChildTasks,
  selectedChildTaskId,
  setSelectedChildTaskId,
}: {
  titleLine: string;
  mode: 'notebook' | 'agent' | 'none';
  contactTaskHint: string | null;
  isCourseOrchestrator: boolean;
  orchestratorChildTasks: OrchestratorChildTaskView[];
  selectedChildTaskId: string | null;
  setSelectedChildTaskId: (id: string | null) => void;
}) {
  return (
    <header className="shrink-0 border-b border-slate-900/[0.06] bg-white/60 px-5 py-4 backdrop-blur-md dark:border-white/[0.08] dark:bg-black/25">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{titleLine}</h1>
      {mode === 'agent' && contactTaskHint ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          任务状态：{contactTaskHint}
        </p>
      ) : null}
      {mode === 'agent' && isCourseOrchestrator && orchestratorChildTasks.length > 0 ? (
        <div className="mt-2 max-h-24 overflow-y-auto rounded-lg border border-slate-900/[0.08] bg-white/70 px-2 py-1 text-[11px] dark:border-white/[0.1] dark:bg-black/30">
          {orchestratorChildTasks.slice(0, 8).map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedChildTaskId(task.id)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10',
                selectedChildTaskId === task.id ? 'bg-black/5 dark:bg-white/10' : '',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  task.status === 'done'
                    ? 'bg-emerald-500'
                    : task.status === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-amber-500',
                )}
                aria-hidden
              />
              <span className="truncate text-foreground">
                {task.title.replace(/^子任务：/, '')}
              </span>
              <span className="truncate text-muted-foreground">{task.detail || ''}</span>
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}
