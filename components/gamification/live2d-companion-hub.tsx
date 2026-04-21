'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, CalendarCheck2, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { useSettingsStore } from '@/lib/store/settings';
import type { Live2DPresenterModelId } from '@/lib/live2d/presenter-models';

const LIVE2D_CHARACTER_TRAITS: Record<
  Live2DPresenterModelId,
  {
    notificationBonuses: Array<{ requiredLevel: number; label: string }>;
    signInBonuses: Array<{ requiredLevel: number; label: string }>;
    maxAffinityGift: string;
  }
> = {
  haru: {
    notificationBonuses: [
      { requiredLevel: 5, label: '学习提醒冷却缩短 6%' },
      { requiredLevel: 10, label: '学习提醒冷却缩短 12%' },
      { requiredLevel: 15, label: '学习提醒冷却缩短 18%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '签到亲密度 +1（首签额外）' },
      { requiredLevel: 10, label: '签到亲密度 +2（首签额外）' },
      { requiredLevel: 15, label: '签到亲密度 +3（首签额外）' },
    ],
    maxAffinityGift: 'Haru 轻快提醒主题包',
  },
  hiyori: {
    notificationBonuses: [
      { requiredLevel: 5, label: '复习提醒触发权重 +10%' },
      { requiredLevel: 10, label: '复习提醒触发权重 +18%' },
      { requiredLevel: 15, label: '复习提醒触发权重 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '夜间签到额外 +1 亲密度' },
      { requiredLevel: 10, label: '夜间签到额外 +2 亲密度' },
      { requiredLevel: 15, label: '夜间签到额外 +3 亲密度' },
    ],
    maxAffinityGift: 'Hiyori 温柔语音提示包',
  },
  mark: {
    notificationBonuses: [
      { requiredLevel: 5, label: '任务完成提醒额外 +8% 积分展示' },
      { requiredLevel: 10, label: '任务完成提醒额外 +14% 积分展示' },
      { requiredLevel: 15, label: '任务完成提醒额外 +20% 积分展示' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '连胜签到额外 +1 连胜保护点' },
      { requiredLevel: 10, label: '连胜签到额外 +2 连胜保护点' },
      { requiredLevel: 15, label: '连胜签到额外 +3 连胜保护点' },
    ],
    maxAffinityGift: 'Mark 冲刺计划模板包',
  },
  mao: {
    notificationBonuses: [
      { requiredLevel: 5, label: '学习提醒文案活跃度 +10%' },
      { requiredLevel: 10, label: '学习提醒文案活跃度 +18%' },
      { requiredLevel: 15, label: '学习提醒文案活跃度 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '签到亲密度额外 +1（早间签到）' },
      { requiredLevel: 10, label: '签到亲密度额外 +2（早间签到）' },
      { requiredLevel: 15, label: '签到亲密度额外 +3（早间签到）' },
    ],
    maxAffinityGift: 'Mao 元气课前提醒卡组',
  },
  ren: {
    notificationBonuses: [
      { requiredLevel: 5, label: '复盘提醒触发权重 +10%' },
      { requiredLevel: 10, label: '复盘提醒触发权重 +18%' },
      { requiredLevel: 15, label: '复盘提醒触发权重 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '签到后首个任务额外 +1 亲密度' },
      { requiredLevel: 10, label: '签到后首个任务额外 +2 亲密度' },
      { requiredLevel: 15, label: '签到后首个任务额外 +3 亲密度' },
    ],
    maxAffinityGift: 'Ren 复盘清单模板包',
  },
  rice: {
    notificationBonuses: [
      { requiredLevel: 5, label: '温和提醒触发权重 +10%' },
      { requiredLevel: 10, label: '温和提醒触发权重 +18%' },
      { requiredLevel: 15, label: '温和提醒触发权重 +26%' },
    ],
    signInBonuses: [
      { requiredLevel: 5, label: '晚间签到额外 +1 亲密度' },
      { requiredLevel: 10, label: '晚间签到额外 +2 亲密度' },
      { requiredLevel: 15, label: '晚间签到额外 +3 亲密度' },
    ],
    maxAffinityGift: 'Rice 晚间陪学主题包',
  },
};

const COMPANION_GIFT_CLAIM_STORAGE_KEY = 'companion-gift-claim-status';
const LIVE2D_POSTER_BY_ID: Partial<Record<Live2DPresenterModelId, string>> = {
  haru: '/liv2d_poster/Haru.png',
  hiyori: '/liv2d_poster/Hiyori.png',
  mark: '/liv2d_poster/Mark.png',
  mao: '/live2d/previews/mao.jpg',
  ren: '/live2d/previews/ren.png',
  rice: '/live2d/previews/rice.jpg',
};
type NotificationActionOption = {
  id: string;
  label: string;
  description: string;
  motionGroup: 'Idle' | 'TapBody';
  motionIndex?: number;
};

const NOTIFICATION_ACTIONS_BY_MODEL: Record<Live2DPresenterModelId, NotificationActionOption[]> = {
  haru: [
    {
      id: 'haru-bow',
      label: '鞠躬（候选）',
      description: '尝试触发 Haru 的礼貌鞠躬动作。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'haru-wave',
      label: '挥手',
      description: '用于轻量问候的通知动作。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'haru-cheer',
      label: '活力提醒',
      description: '用于任务完成时更明显的提醒。',
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
  ],
  hiyori: [
    {
      id: 'hiyori-bow',
      label: '鞠躬（候选）',
      description: '尝试触发 Hiyori 的礼貌动作。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'hiyori-soft',
      label: '温柔点头',
      description: '用于更柔和的通知场景。',
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'hiyori-normal',
      label: '标准提醒',
      description: '默认通知动作。',
      motionGroup: 'Idle',
      motionIndex: 0,
    },
  ],
  mark: [
    {
      id: 'mark-nod',
      label: '点头',
      description: '简洁确认型通知动作。',
      motionGroup: 'Idle',
      motionIndex: 1,
    },
    {
      id: 'mark-bow',
      label: '鞠躬（候选）',
      description: '尝试触发 Mark 的礼貌动作。',
      motionGroup: 'Idle',
      motionIndex: 2,
    },
    {
      id: 'mark-strong',
      label: '强调提醒',
      description: '用于重要通知的动作。',
      motionGroup: 'Idle',
      motionIndex: 4,
    },
  ],
  mao: [
    {
      id: 'mao-wave',
      label: '挥手',
      description: '用于轻快欢迎的通知动作。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'mao-cheer',
      label: '活力提醒',
      description: '用于更有存在感的学习提醒。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'mao-idle',
      label: '标准提醒',
      description: '默认通知动作。',
      motionGroup: 'Idle',
      motionIndex: 0,
    },
  ],
  ren: [
    {
      id: 'ren-nod',
      label: '点头',
      description: '用于简洁确认型通知。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'ren-focus',
      label: '专注提醒',
      description: '用于开始任务前的稳定提醒。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'ren-idle',
      label: '标准提醒',
      description: '默认通知动作。',
      motionGroup: 'Idle',
      motionIndex: 0,
    },
  ],
  rice: [
    {
      id: 'rice-soft',
      label: '温柔点头',
      description: '用于柔和、低打扰的通知场景。',
      motionGroup: 'TapBody',
      motionIndex: 0,
    },
    {
      id: 'rice-wave',
      label: '挥手',
      description: '用于轻量问候和签到提示。',
      motionGroup: 'TapBody',
      motionIndex: 1,
    },
    {
      id: 'rice-cheer',
      label: '鼓励提醒',
      description: '用于任务完成后的鼓励动作。',
      motionGroup: 'TapBody',
      motionIndex: 2,
    },
  ],
};

function toLive2DModelId(id: string): Live2DPresenterModelId | null {
  if (
    id === 'haru' ||
    id === 'hiyori' ||
    id === 'mark' ||
    id === 'mao' ||
    id === 'ren' ||
    id === 'rice'
  ) {
    return id;
  }
  return null;
}

function resolveBonusTier(
  tiers: Array<{ requiredLevel: number; label: string }>,
  level: number,
): {
  current: { requiredLevel: number; label: string } | null;
  next: { requiredLevel: number; label: string } | null;
} {
  const sorted = [...tiers].sort((a, b) => a.requiredLevel - b.requiredLevel);
  const unlocked = sorted.filter((tier) => level >= tier.requiredLevel);
  const current = unlocked.length > 0 ? unlocked[unlocked.length - 1] : null;
  const next = sorted.find((tier) => tier.requiredLevel > level) ?? null;
  return { current, next };
}

export function Live2DCompanionHub() {
  const { summary, loading, equipCharacter, selectPreferredCharacter } =
    useGamificationSummary(true);
  const notificationCompanionId = useSettingsStore((s) => s.notificationCompanionId);
  const checkInCompanionId = useSettingsStore((s) => s.checkInCompanionId);
  const setNotificationCompanionId = useSettingsStore((s) => s.setNotificationCompanionId);
  const setCheckInCompanionId = useSettingsStore((s) => s.setCheckInCompanionId);
  const [giftClaimStatus, setGiftClaimStatus] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(COMPANION_GIFT_CLAIM_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [notificationMotionTrigger, setNotificationMotionTrigger] = useState<{
    token: number;
    motionGroup: 'Idle' | 'TapBody';
    motionIndex?: number;
  } | null>(null);

  const handleEquip = async (characterId: string) => {
    try {
      await equipCharacter(characterId);
      toast.success('已切换当前课堂讲师');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换角色失败');
    }
  };

  const live2dCharacters =
    summary?.characters.filter((character) => character.assetType === 'LIVE2D') ?? [];
  const sortedLive2dCharacters = [...live2dCharacters].sort((a, b) => {
    if (a.isUnlocked === b.isUnlocked) return 0;
    return a.isUnlocked ? -1 : 1;
  });
  const unlockedLive2dCharacters = live2dCharacters.filter((character) => character.isUnlocked);
  const unlockedLive2dIds = new Set(
    live2dCharacters.filter((character) => character.isUnlocked).map((character) => character.id),
  );
  const selectedNotificationCharacter =
    unlockedLive2dCharacters.find((character) => {
      const modelId = toLive2DModelId(character.id);
      return modelId != null && modelId === notificationCompanionId;
    }) ??
    unlockedLive2dCharacters[0] ??
    null;
  const selectedNotificationModelId = selectedNotificationCharacter
    ? toLive2DModelId(selectedNotificationCharacter.id)
    : null;
  const selectedNotificationTrait = selectedNotificationModelId
    ? LIVE2D_CHARACTER_TRAITS[selectedNotificationModelId]
    : null;
  const notificationActionOptions = selectedNotificationModelId
    ? NOTIFICATION_ACTIONS_BY_MODEL[selectedNotificationModelId]
    : [];
  const activeNotificationActionId = notificationActionOptions.some(
    (option) => option.id === notificationActionId,
  )
    ? notificationActionId
    : (notificationActionOptions[0]?.id ?? null);
  const selectedNotificationBonusTier = selectedNotificationTrait
    ? resolveBonusTier(
        selectedNotificationTrait.notificationBonuses,
        selectedNotificationCharacter?.affinityLevel ?? 1,
      )
    : null;
  const selectedCheckInCharacter =
    unlockedLive2dCharacters.find((character) => {
      const modelId = toLive2DModelId(character.id);
      return modelId != null && modelId === checkInCompanionId;
    }) ??
    unlockedLive2dCharacters[0] ??
    null;
  const selectedCheckInModelId = selectedCheckInCharacter
    ? toLive2DModelId(selectedCheckInCharacter.id)
    : null;
  const selectedCheckInTrait = selectedCheckInModelId
    ? LIVE2D_CHARACTER_TRAITS[selectedCheckInModelId]
    : null;
  const selectedCheckInBonusTier = selectedCheckInTrait
    ? resolveBonusTier(
        selectedCheckInTrait.signInBonuses,
        selectedCheckInCharacter?.affinityLevel ?? 1,
      )
    : null;
  const selectedCheckInGiftClaimed = selectedCheckInModelId
    ? giftClaimStatus[selectedCheckInModelId] === true
    : false;

  useEffect(() => {
    if (!summary?.databaseEnabled) return;
    const preferredId = toLive2DModelId(summary.profile.preferredCharacterId);
    if (!preferredId) return;
    if (checkInCompanionId !== preferredId) {
      setCheckInCompanionId(preferredId);
    }
  }, [summary, checkInCompanionId, setCheckInCompanionId]);

  const handleSelectNotificationCompanion = (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;
    if (!unlockedLive2dIds.has(characterId)) {
      toast.error('请先解锁该角色，再设为通知讲师');
      return;
    }
    setNotificationCompanionId(modelId);
    toast.success(`已设置 ${modelId} 为通知讲师`);
  };

  const handleTriggerNotificationAction = (option: NotificationActionOption) => {
    setNotificationActionId(option.id);
    setNotificationMotionTrigger((current) => ({
      token: (current?.token ?? 0) + 1,
      motionGroup: option.motionGroup,
      motionIndex: option.motionIndex,
    }));
    toast.success(`已触发动作：${option.label}`);
  };

  const handleSelectCheckInCompanion = async (characterId: string) => {
    const modelId = toLive2DModelId(characterId);
    if (!modelId) return;
    if (!unlockedLive2dIds.has(characterId)) {
      toast.error('请先解锁该角色，再设为签到培养角色');
      return;
    }
    try {
      await selectPreferredCharacter(characterId);
      setCheckInCompanionId(modelId);
      toast.success(`签到将优先培养 ${modelId} 的亲密度`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置签到培养角色失败');
    }
  };

  const handleClaimCompanionGift = (characterId: Live2DPresenterModelId) => {
    const next = { ...giftClaimStatus, [characterId]: true };
    setGiftClaimStatus(next);
    try {
      window.localStorage.setItem(COMPANION_GIFT_CLAIM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore persistence errors; keep current session state.
    }
    toast.success('礼物已领取');
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 !gap-0 border-muted/40 bg-white/85 backdrop-blur-xl dark:bg-slate-900/80">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">通知讲师</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              通知讲师影响提醒风格与通知动作预览。
            </p>
          </div>
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>

        {!summary ? null : !summary.databaseEnabled ? (
          <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
            当前环境还没有数据库同步，通知讲师暂时不可用。
          </div>
        ) : (
          <div className="mt-4">
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                {unlockedLive2dCharacters.map((character) => {
                  const modelId = toLive2DModelId(character.id);
                  if (!modelId) return null;
                  const selected = notificationCompanionId === modelId;
                  return (
                    <Button
                      key={`notify-${character.id}`}
                      type="button"
                      size="sm"
                      className="w-full justify-start"
                      variant={selected ? 'default' : 'outline'}
                      onClick={() => handleSelectNotificationCompanion(character.id)}
                    >
                      {character.name}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center justify-center">
                {selectedNotificationCharacter && selectedNotificationModelId ? (
                  <div className="flex w-full max-w-[620px] items-start justify-center gap-3">
                    <div className="apple-glass-heavy relative w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/50 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] dark:border-white/8 dark:shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
                      <div className="relative flex items-start gap-3">
                        <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/60 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-200">
                          <Bell className="size-5" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold tracking-[0.18em] text-emerald-700 uppercase dark:text-emerald-200">
                              通知预览
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {selectedNotificationCharacter.name}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                            今天学习奖励已到账
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            任务完成、连胜提醒、签到提示将使用当前讲师语气。
                          </p>
                          {selectedNotificationBonusTier?.current ? (
                            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                              {`通知加成（Lv${selectedNotificationBonusTier.current.requiredLevel}+）：${selectedNotificationBonusTier.current.label}`}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                              通知加成尚未解锁（Lv5 开始生效）
                            </p>
                          )}
                          {selectedNotificationBonusTier?.next ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {`下一档 Lv${selectedNotificationBonusTier.next.requiredLevel}：${selectedNotificationBonusTier.next.label}`}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-300">
                              已解锁最高通知加成
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          <div className="relative flex min-h-[112px] w-[96px] items-end overflow-hidden rounded-[18px] bg-transparent">
                            <TalkingAvatarOverlay
                              layout="card"
                              speaking={false}
                              cadence="idle"
                              speechText="通知动作预览"
                              manualMotionTrigger={notificationMotionTrigger}
                              modelIdOverride={selectedNotificationModelId}
                              cardFraming={
                                selectedNotificationModelId === 'haru' ||
                                selectedNotificationModelId === 'hiyori' ||
                                selectedNotificationModelId === 'rice'
                                  ? 'half'
                                  : 'default'
                              }
                              showBadge={false}
                              showStatusDot={false}
                              className="h-full min-h-[112px] w-[96px] flex-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-[180px] rounded-lg border border-slate-200/70 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/5">
                      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        通知动作
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {notificationActionOptions.map((option) => (
                          <Button
                            key={`notify-action-${option.id}`}
                            type="button"
                            size="sm"
                            className="w-full justify-start"
                            variant={
                              activeNotificationActionId === option.id ? 'default' : 'outline'
                            }
                            onClick={() => handleTriggerNotificationAction(option)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无可用讲师用于通知预览。</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 !gap-0 border-muted/40 bg-white/85 backdrop-blur-xl dark:bg-slate-900/80">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">签到培养角色</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              签到培养角色决定签到亲密度归属与成长加成。
            </p>
          </div>
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>

        {!summary ? null : !summary.databaseEnabled ? (
          <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
            当前环境还没有数据库同步，签到培养角色暂时不可用。
          </div>
        ) : (
          <div className="mt-4">
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-2">
                {unlockedLive2dCharacters.map((character) => {
                  const modelId = toLive2DModelId(character.id);
                  if (!modelId) return null;
                  const selected = checkInCompanionId === modelId;
                  return (
                    <Button
                      key={`signin-${character.id}`}
                      type="button"
                      size="sm"
                      className="w-full justify-start"
                      variant={selected ? 'default' : 'outline'}
                      onClick={() => void handleSelectCheckInCompanion(character.id)}
                    >
                      {character.name}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center justify-center">
                {selectedCheckInCharacter && selectedCheckInModelId ? (
                  <div className="grid w-full max-w-[860px] gap-3 lg:grid-cols-2">
                    <div className="overflow-hidden rounded-2xl border border-fuchsia-200/70 bg-[linear-gradient(180deg,rgba(253,242,248,0.86),rgba(255,255,255,0.9))] dark:border-fuchsia-400/20 dark:bg-[linear-gradient(180deg,rgba(112,26,117,0.2),rgba(15,23,42,0.6))]">
                      <div className="flex items-center justify-between border-b border-fuchsia-200/70 px-4 py-3 dark:border-fuchsia-400/20">
                        <div className="flex items-center gap-2">
                          <CalendarCheck2 className="size-4 text-fuchsia-600 dark:text-fuchsia-300" />
                          <p className="text-xs font-semibold tracking-[0.16em] text-fuchsia-700 uppercase dark:text-fuchsia-200">
                            签到加成效果
                          </p>
                        </div>
                        <span className="rounded-full bg-fuchsia-500/12 px-2.5 py-1 text-[11px] font-medium text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-200">
                          签到培养
                        </span>
                      </div>
                      <div className="space-y-3 px-4 py-3">
                        <div className="flex items-center justify-between rounded-xl border border-fuchsia-200/70 bg-white/75 px-3 py-2 dark:border-fuchsia-400/20 dark:bg-white/5">
                          <span className="text-xs text-muted-foreground">当前培养角色</span>
                          <span className="text-sm font-semibold text-foreground">
                            {selectedCheckInCharacter.name}
                          </span>
                        </div>
                        <div className="rounded-xl border border-fuchsia-200/70 bg-white/75 p-3 dark:border-fuchsia-400/20 dark:bg-white/5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-muted-foreground">
                              亲密度 Lv{selectedCheckInCharacter.affinityLevel}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {selectedCheckInCharacter.affinityExp} EXP
                            </span>
                          </div>
                          <div className="mt-2">
                            <Progress
                              value={Math.max(
                                0,
                                Math.min(
                                  100,
                                  Math.round((selectedCheckInCharacter.affinityExp / 300) * 100),
                                ),
                              )}
                            />
                          </div>
                        </div>
                        <div className="rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/60 p-3 dark:border-fuchsia-400/20 dark:bg-fuchsia-950/20">
                          <p className="text-[11px] font-medium tracking-[0.08em] text-fuchsia-700 uppercase dark:text-fuchsia-300">
                            生效加成
                          </p>
                          <p className="mt-1 text-sm font-medium text-fuchsia-800 dark:text-fuchsia-100">
                            {selectedCheckInBonusTier?.current
                              ? `Lv${selectedCheckInBonusTier.current.requiredLevel}+：${selectedCheckInBonusTier.current.label}`
                              : '签到加成尚未解锁（Lv5 开始生效）'}
                          </p>
                          {selectedCheckInBonusTier?.next ? (
                            <p className="mt-1 text-[11px] text-fuchsia-700/80 dark:text-fuchsia-300/80">
                              {`下一档 Lv${selectedCheckInBonusTier.next.requiredLevel}：${selectedCheckInBonusTier.next.label}`}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-300">
                              已解锁最高签到加成
                            </p>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          每日签到结算时会按当前培养角色生效。
                        </p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-sky-200/70 bg-[linear-gradient(180deg,rgba(239,246,255,0.9),rgba(255,255,255,0.92))] dark:border-sky-400/20 dark:bg-[linear-gradient(180deg,rgba(12,74,110,0.22),rgba(15,23,42,0.62))]">
                      <div className="border-b border-sky-200/70 px-4 py-3 dark:border-sky-400/20">
                        <p className="text-xs font-semibold tracking-[0.16em] text-sky-700 uppercase dark:text-sky-200">
                          可解锁加成档位
                        </p>
                      </div>
                      <div className="space-y-2.5 px-4 py-3">
                        {(selectedCheckInTrait?.signInBonuses ?? []).map((tier) => {
                          const level = selectedCheckInCharacter.affinityLevel;
                          const unlocked = level >= tier.requiredLevel;
                          const current =
                            selectedCheckInBonusTier?.current?.requiredLevel === tier.requiredLevel;
                          return (
                            <div
                              key={`signin-tier-${tier.requiredLevel}-${tier.label}`}
                              className={cn(
                                'rounded-xl border px-3 py-2',
                                current
                                  ? 'border-emerald-300/70 bg-emerald-50/70 dark:border-emerald-400/30 dark:bg-emerald-950/20'
                                  : unlocked
                                    ? 'border-sky-200/70 bg-white/70 dark:border-sky-400/20 dark:bg-white/5'
                                    : 'border-muted/60 bg-background/60',
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-foreground">{`Lv${tier.requiredLevel}`}</span>
                                <span
                                  className={cn(
                                    'text-[11px]',
                                    current
                                      ? 'text-emerald-700 dark:text-emerald-300'
                                      : unlocked
                                        ? 'text-sky-700 dark:text-sky-300'
                                        : 'text-muted-foreground',
                                  )}
                                >
                                  {current ? '当前生效' : unlocked ? '已解锁' : '未解锁'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{tier.label}</p>
                            </div>
                          );
                        })}
                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 dark:border-amber-400/25 dark:bg-amber-950/20">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">Lv20 礼物</span>
                            {selectedCheckInCharacter.affinityLevel < 20 ? (
                              <span className="text-[11px] text-muted-foreground">未解锁</span>
                            ) : selectedCheckInGiftClaimed ? (
                              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                已领取
                              </span>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2.5 text-[11px]"
                                onClick={() =>
                                  selectedCheckInModelId
                                    ? handleClaimCompanionGift(selectedCheckInModelId)
                                    : undefined
                                }
                              >
                                领取礼物
                              </Button>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedCheckInTrait?.maxAffinityGift ?? '满级专属礼物'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无可用讲师用于签到预览。</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 !gap-0 border-muted/40 bg-white/85 backdrop-blur-xl dark:bg-slate-900/80">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">课堂讲师角色</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              在这里选择课堂由谁来讲；未解锁角色需要去抽卡补给站抽取碎片。
            </p>
          </div>
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>

        {!summary ? null : !summary.databaseEnabled ? (
          <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
            当前环境还没有数据库同步，角色解锁与亲密度暂时不可用。
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {sortedLive2dCharacters.map((character) => {
              const locked = !character.isUnlocked;
              const modelId = toLive2DModelId(character.id);
              const posterSrc = modelId ? LIVE2D_POSTER_BY_ID[modelId] : null;
              return (
                <div
                  key={character.id}
                  role={locked ? undefined : 'button'}
                  tabIndex={locked ? -1 : 0}
                  onClick={() => {
                    if (locked || character.isEquipped) return;
                    void handleEquip(character.id);
                  }}
                  onKeyDown={(event) => {
                    if (locked || character.isEquipped) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    void handleEquip(character.id);
                  }}
                  className={cn(
                    'overflow-hidden rounded-[24px] border bg-background/60 transition-colors',
                    !locked && !character.isEquipped && 'cursor-pointer hover:bg-background/80',
                    character.isEquipped && 'ring-2 ring-sky-300/70',
                  )}
                >
                  <div className="relative aspect-[5/4] overflow-hidden bg-white dark:bg-white">
                    <img
                      src={posterSrc || character.previewSrc || ''}
                      alt={character.name}
                      className={cn(
                        'h-full w-full object-contain object-top',
                        locked && 'opacity-55 blur-[1px]',
                      )}
                    />
                    {!character.isUnlocked ? (
                      <>
                        <div className="absolute inset-0 bg-slate-950/35" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-white/12 p-3 text-white backdrop-blur">
                            <Lock className="size-5" />
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{character.name}</p>
                      </div>
                    </div>

                    {locked ? (
                      <div className="rounded-2xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                        {character.nextUnlockHint}
                      </div>
                    ) : null}

                    {locked ? (
                      <div className="flex items-center gap-2">
                        <Button className="flex-1" asChild>
                          <Link href="/store/avatars">去补给站抽取</Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
