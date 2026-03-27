'use client';

import type { ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Scene } from '@/lib/types/stage';
import { cn } from '@/lib/utils';

function sceneTypeLabel(scene: Scene): string {
  if (scene.type === 'quiz') return '测验';
  if (scene.type === 'interactive') return '交互';
  if (scene.type === 'pbl') return '项目式学习';
  return '非幻灯片';
}

export function ScenePreviewDialog({
  scene,
  trigger,
  description = '仅预览当前这张 slides。',
  topBar,
  bottomBar,
}: {
  scene: Scene;
  trigger: ReactElement;
  description?: string;
  topBar?: ReactNode;
  bottomBar?: ReactNode;
}) {
  return (
    <Dialog modal={false}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showOverlay={false}
        showCloseButton={false}
        className="w-[min(92vw,860px)] max-w-[860px] overflow-hidden p-4"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{scene.title || '场景预览'}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogClose
          className={cn(
            'absolute right-3 top-3 z-20 inline-flex size-8 items-center justify-center rounded-full',
            'border border-slate-900/[0.08] bg-white/78 text-slate-700 backdrop-blur-md transition-all',
            'hover:bg-white hover:text-slate-900 hover:shadow-sm',
            'dark:border-white/[0.14] dark:bg-black/45 dark:text-slate-200 dark:hover:bg-black/65 dark:hover:text-white',
          )}
          aria-label="关闭预览"
        >
          <X className="size-4" />
        </DialogClose>
        {topBar ? <div className="mt-1 mb-2 pr-10">{topBar}</div> : null}
        <div className="mt-2 flex items-center justify-center overflow-auto rounded-[12px] border border-slate-900/[0.08] bg-white/85 p-2 dark:border-white/[0.1] dark:bg-black/30">
          {scene.content.type === 'slide' ? (
            <ThumbnailSlide
              slide={scene.content.canvas}
              size={760}
              viewportSize={scene.content.canvas.viewportSize ?? 1000}
              viewportRatio={scene.content.canvas.viewportRatio ?? 0.5625}
            />
          ) : (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              该页为{sceneTypeLabel(scene)}，暂无幻灯片可预览。
            </p>
          )}
        </div>
        {bottomBar ? <div className="mt-2">{bottomBar}</div> : null}
      </DialogContent>
    </Dialog>
  );
}

