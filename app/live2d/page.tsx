'use client';

import { Live2DCompanionHub } from '@/components/gamification/live2d-companion-hub';
import { Live2dPresenterSettingsPanel } from '@/components/settings/live2d-presenter-settings-panel';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';

export default function Live2dSettingsPage() {
  const { locale } = useI18n();
  const isZh = locale === 'zh-CN';
  const { summary, loading } = useGamificationSummary(true);
  const databaseEnabled = summary?.databaseEnabled ?? false;

  return (
    <div className="h-full w-full apple-mesh-bg relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orb-2 absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(88,86,214,0.06)_0%,transparent_70%)]" />
        <div className="animate-orb-1 absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(0,122,255,0.05)_0%,transparent_70%)]" />
      </div>
      <main className="relative z-10 h-full w-full p-0">
        <Live2DCompanionHub />
        {!loading && !databaseEnabled ? (
          <section className="mt-6 rounded-xl border border-border/80 bg-card/50 p-5 shadow-sm backdrop-blur-sm dark:bg-card/40">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">
                {isZh ? '本地模式补充设置' : 'Local Mode Settings'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isZh
                  ? '当前还没有启用数据库同步，通知角色与签到成长不会持久化；但你仍然可以先挑选课堂讲解角色。'
                  : 'Database sync is currently disabled. Notification and check-in roles will not persist yet, but you can still choose the classroom presenter.'}
              </p>
            </div>
            <Live2dPresenterSettingsPanel />
          </section>
        ) : null}
      </main>
    </div>
  );
}
