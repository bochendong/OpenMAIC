'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ClassroomFooterProps {
  readonly leadingSlot?: ReactNode;
  readonly trailingSlot?: ReactNode;
  readonly className?: string;
}

export function ClassroomFooter({
  leadingSlot,
  trailingSlot,
  className,
}: ClassroomFooterProps) {
  if (!leadingSlot && !trailingSlot) return null;

  return (
    <footer
      className={cn(
        'z-10 shrink-0 border-t border-slate-900/[0.06] bg-white/72 backdrop-blur-xl',
        'dark:border-white/[0.08] dark:bg-[#0d0d10]/62',
        className,
      )}
    >
      <div className="flex flex-col gap-2 px-3 py-2 md:flex-row md:items-center md:justify-between md:px-4">
        {leadingSlot ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{leadingSlot}</div>
        ) : (
          <div />
        )}
        {trailingSlot ? (
          <div className="flex min-w-0 items-center justify-start overflow-x-auto md:justify-end">
            {trailingSlot}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
