'use client';

import Link from 'next/link';
import { Live2DCompanionHub } from '@/components/gamification/live2d-companion-hub';
import { Live2dPresenterSettingsPanel } from '@/components/settings/live2d-presenter-settings-panel';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';

export default function Live2dSettingsPage() {
  const { t, locale } = useI18n();
  const isZh = locale === 'zh-CN';
  const { summary, loading } = useGamificationSummary(true);
  const databaseEnabled = summary?.databaseEnabled ?? false;

  return (
    <div className="min-h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.06)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.05)_0%,transparent_70%)]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        {loading || databaseEnabled ? <Live2DCompanionHub /> : null}
        {!loading && !databaseEnabled ? (
          <section className="rounded-xl border border-border/80 bg-card/50 p-5 shadow-sm backdrop-blur-sm dark:bg-card/40">
            <Live2dPresenterSettingsPanel />
          </section>
        ) : null}
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
