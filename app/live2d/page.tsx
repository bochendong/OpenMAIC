'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Live2dPresenterSettingsPanel } from '@/components/settings/live2d-presenter-settings-panel';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

export default function Live2dSettingsPage() {
  const { t, locale } = useI18n();
  const isZh = locale === 'zh-CN';

  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.06)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.05)_0%,transparent_70%)]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-12 pt-8 md:px-8">
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 rounded-lg" asChild>
          <Link href="/my-courses">{isZh ? '← 课程主页' : '← My courses'}</Link>
        </Button>
        <section className="mb-6 apple-glass rounded-[28px] p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
              <Sparkles className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {isZh ? '虚拟讲师' : 'Virtual presenter'}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                {isZh
                  ? '选择课堂左侧栏「虚拟讲师」标签中使用的讲师形象；与全站设置共用同一选项。'
                  : 'Choose the presenter look for the classroom sidebar; the same choice is stored in your app settings.'}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border/80 bg-card/50 p-5 shadow-sm backdrop-blur-sm dark:bg-card/40">
          <Live2dPresenterSettingsPanel />
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {isZh ? '更多选项见' : 'More options in'}{' '}
          <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
            {t('settings.title')}
          </Link>
        </p>
      </main>
    </div>
  );
}
