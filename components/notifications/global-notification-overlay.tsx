'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, Coins, Heart, Sparkles, X } from 'lucide-react';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import type { AppNotification } from '@/lib/notifications/types';
import { useNotificationStore } from '@/lib/store/notifications';
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

function buildCompanionCopy(item: AppNotification): { eyebrow: string; line: string } {
  if (item.sourceKind === 'NOTEBOOK_GENERATION_GROUP') {
    return {
      eyebrow: '生成总账单',
      line: '这次笔记本生成我帮你记成一笔了，不再一条条打扰你。',
    };
  }

  if (item.tone !== 'positive') {
    return {
      eyebrow: '积分变动',
      line: '这次积分变化已经替你记好啦，继续专心学习就行。',
    };
  }

  switch (item.sourceKind) {
    case 'LESSON_REWARD':
      return {
        eyebrow: '看课奖励',
        line: '这节课学得很稳，奖励已经到账啦。',
      };
    case 'QUIZ_COMPLETION_REWARD':
      return {
        eyebrow: '做题奖励',
        line: '这一组题完成啦，状态已经续上了。',
      };
    case 'QUIZ_ACCURACY_BONUS':
      return {
        eyebrow: '正确率加成',
        line: '这次答得很漂亮，额外奖励也一起掉落。',
      };
    case 'REVIEW_REWARD':
      return {
        eyebrow: '回炉奖励',
        line: '错题回来看过了，进步我都帮你记着。',
      };
    case 'DAILY_TASK_REWARD':
      return {
        eyebrow: '今日任务',
        line: '今天的小目标清空啦，辛苦有回音。',
      };
    case 'STREAK_BONUS':
      return {
        eyebrow: '连续学习',
        line: '坚持的奖励来啦，今天也在稳稳变强。',
      };
    default:
      return {
        eyebrow: '积分到账',
        line: '你的努力已经变成积分了，我看到啦。',
      };
  }
}

function shouldShowCompanion(item: AppNotification): boolean {
  return item.tone === 'positive' || item.sourceKind === 'NOTEBOOK_GENERATION_GROUP';
}

function NotificationBannerCard({ item }: { item: AppNotification }) {
  const dismissBanner = useNotificationStore((state) => state.dismissBanner);
  const primaryDetail = item.details.find((detail) =>
    ['notebook', 'scene', 'model', 'service', 'reason'].includes(detail.key),
  );
  const companionCopy = buildCompanionCopy(item);
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
          className={cn(
            'absolute inset-x-0 top-0 h-px',
            item.tone === 'positive'
              ? 'bg-gradient-to-r from-emerald-400/0 via-emerald-400/90 to-sky-400/0'
              : 'bg-gradient-to-r from-rose-400/0 via-rose-400/85 to-orange-400/0',
          )}
        />
        <div
          className={cn(
            'pointer-events-none absolute inset-x-4 top-3 h-24 rounded-[22px] blur-2xl',
            item.tone === 'positive'
              ? 'bg-[radial-gradient(circle_at_top_left,rgba(74,222,128,0.24),transparent_48%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_44%),radial-gradient(circle_at_bottom,rgba(253,224,71,0.14),transparent_36%)]'
              : 'bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_44%)]',
          )}
        />
        <div className="relative flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border',
              item.tone === 'positive'
                ? 'border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-200'
                : 'border-rose-300/70 bg-rose-500/12 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/12 dark:text-rose-200',
            )}
          >
            {item.tone === 'positive' ? (
              <Sparkles className="size-5" strokeWidth={1.8} />
            ) : item.sourceKind === 'TOKEN_USAGE' || item.sourceKind === 'NOTEBOOK_GENERATION_GROUP' ? (
              <Bell className="size-5" strokeWidth={1.8} />
            ) : (
              <Coins className="size-5" strokeWidth={1.8} />
            )}
          </div>

          <Link href="/notifications" className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-[0.18em]',
                  item.tone === 'positive'
                    ? 'text-emerald-700 dark:text-emerald-200'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
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
                  item.tone === 'positive'
                    ? 'bg-emerald-500/14 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-100'
                    : 'bg-rose-500/12 text-rose-700 dark:bg-rose-400/12 dark:text-rose-100',
                )}
              >
                {item.amountLabel}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                当前余额 {formatBalanceLabel(item)}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
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
                  item.tone === 'positive'
                    ? 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200'
                    : 'bg-rose-500/12 text-rose-700 dark:bg-rose-400/12 dark:text-rose-200',
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
            <div className="hidden shrink-0 self-stretch sm:flex">
              <div
                className={cn(
                  'relative flex min-h-[138px] w-[118px] items-end overflow-hidden rounded-[22px] border',
                  item.tone === 'positive'
                    ? 'border-emerald-300/40 bg-[linear-gradient(180deg,rgba(236,253,245,0.9),rgba(219,234,254,0.58))] dark:border-emerald-400/20 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.18),rgba(12,74,110,0.12))]'
                    : 'border-rose-300/35 bg-[linear-gradient(180deg,rgba(255,241,242,0.92),rgba(255,237,213,0.62))] dark:border-rose-400/18 dark:bg-[linear-gradient(180deg,rgba(127,29,29,0.18),rgba(124,45,18,0.12))]',
                )}
              >
                <TalkingAvatarOverlay
                  layout="card"
                  speaking={companionSpeaking}
                  cadence={item.tone === 'positive' ? 'active' : 'pause'}
                  speechText={companionCopy.line}
                  showBadge={false}
                  showStatusDot={false}
                  className="h-full min-h-[138px] w-[118px] flex-none"
                />
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => dismissBanner(item.id)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/8 dark:hover:text-white"
            aria-label="关闭通知"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
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
