'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { AppNotification } from '@/lib/notifications/types';
import { buildNotificationCompanionCopy } from '@/lib/notifications/companion-copy';
import { getNotificationCardTheme } from '@/lib/notifications/card-theme';
import { resolveNotificationCompanionModelId } from '@/lib/notifications/companion-model';
import { useNotificationStore } from '@/lib/store/notifications';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';
import {
  formatCashCreditsLabel,
  formatComputeCreditsLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';

const AUTO_DISMISS_MS = 6500;

function formatBannerTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBalanceLabel(item: AppNotification): string {
  switch (item.accountType) {
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(item.balanceAfter);
    case 'COMPUTE':
      return formatComputeCreditsLabel(item.balanceAfter);
    default:
      return formatCashCreditsLabel(item.balanceAfter);
  }
}

function shouldShowCompanion(item: AppNotification): boolean {
  return item.tone === 'positive' || item.sourceKind === 'NOTEBOOK_GENERATION_GROUP';
}

function NotificationBannerCard({ item }: { item: AppNotification }) {
  const dismissBanner = useNotificationStore((state) => state.dismissBanner);
  const notificationCompanionId = useSettingsStore((state) => state.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((state) => state.checkInCompanionId);
  const primaryDetail = item.details.find((detail) =>
    ['notebook', 'scene', 'model', 'service', 'reason'].includes(detail.key),
  );
  const companionCopy = buildNotificationCompanionCopy(item);
  const cardTheme = getNotificationCardTheme(item);
  const resolvedCompanionModelId = resolveNotificationCompanionModelId(
    item,
    notificationCompanionId,
    checkInCompanionId,
  );
  const showCompanion = shouldShowCompanion(item);
  const [companionSpeaking, setCompanionSpeaking] = useState(showCompanion);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismissBanner(item.id);
    }, AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dismissBanner, item.id]);

  useEffect(() => {
    if (!showCompanion) return;

    const timer = window.setTimeout(() => {
      setCompanionSpeaking(false);
    }, item.tone === 'positive' ? 2200 : 1600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [item.id, item.tone, showCompanion]);

  return (
    <div className="pointer-events-auto animate-fade-up">
      <div className="apple-glass-heavy relative overflow-hidden rounded-[24px] border border-white/50 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-white/8 dark:shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
        <div
          className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r', cardTheme.topLineClass)}
        />
        <div
          className={cn(
            'pointer-events-none absolute inset-x-4 top-3 h-24 rounded-[22px] blur-2xl',
            cardTheme.glowClass,
          )}
        />
        <div className="relative flex items-start gap-3">
          <Link href="/notifications" className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', cardTheme.eyebrowClass)}>
                {companionCopy.eyebrow}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {formatBannerTime(item.createdAt)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold shadow-sm',
                  cardTheme.amountPrimaryClass,
                )}
              >
                {item.amountLabel}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                当前余额 {formatBalanceLabel(item)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{companionCopy.line}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {item.body}
            </p>
            {primaryDetail ? (
              <p className="mt-2 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {primaryDetail.label}: {primaryDetail.value}
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                  cardTheme.amountChipClass,
                )}
              >
                {item.amountLabel}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{item.sourceLabel}</span>
              {item.tone === 'positive' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-300/10 dark:text-amber-200">
                  <Heart className="size-3" strokeWidth={1.9} />
                  已收下
                </span>
              ) : null}
            </div>
          </Link>

          {showCompanion ? (
            <div className="hidden shrink-0 self-center sm:flex">
              <div className="relative flex h-[172px] w-[118px] items-end overflow-hidden rounded-[22px]">
                <TalkingAvatarOverlay
                  layout="card"
                  speaking={companionSpeaking}
                  cadence={item.tone === 'positive' ? 'active' : 'pause'}
                  speechText={companionCopy.line}
                  modelIdOverride={resolvedCompanionModelId}
                  cardFraming={
                    resolvedCompanionModelId === 'haru' ||
                    resolvedCompanionModelId === 'hiyori' ||
                    resolvedCompanionModelId === 'rice'
                      ? 'half'
                      : 'default'
                  }
                  showBadge={false}
                  showStatusDot={false}
                  className="h-full min-h-[172px] w-[118px] flex-none"
                />
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}

export function GlobalNotificationOverlay() {
  const activeBanners = useNotificationStore((state) => state.activeBanners);

  if (activeBanners.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[1600] flex justify-center px-4 sm:justify-end sm:px-6">
      <div className="flex w-full max-w-[420px] flex-col gap-3">
        {activeBanners.map((item) => (
          <NotificationBannerCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
