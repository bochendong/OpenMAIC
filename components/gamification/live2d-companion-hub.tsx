'use client';

import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';
import { TalkingAvatarOverlay } from '@/components/canvas/talking-avatar-overlay';
import { GamificationSummaryCard } from '@/components/gamification/gamification-summary-card';

export function Live2DCompanionHub() {
  const { summary, loading, unlockCharacter, equipCharacter } = useGamificationSummary(true);

  const handleUnlock = async (characterId: string) => {
    try {
      await unlockCharacter(characterId);
      toast.success('已解锁新的陪伴角色');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '角色解锁失败');
    }
  };

  const handleEquip = async (characterId: string) => {
    try {
      await equipCharacter(characterId);
      toast.success('已切换当前陪伴角色');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换角色失败');
    }
  };

  const live2dCharacters =
    summary?.characters.filter((character) => character.assetType === 'LIVE2D') ?? [];

  return (
    <div className="space-y-6">
      <GamificationSummaryCard title="陪伴系统总览" />

      <Card className="p-5 !gap-0 border-muted/40 bg-white/85 backdrop-blur-xl dark:bg-slate-900/80">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Live2D 角色图鉴</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              用购买积分和亲密度解锁更多陪伴角色，再把喜欢的那位设成当前搭子。
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
            {live2dCharacters.map((character) => {
              const locked = !character.isUnlocked;
              return (
                <div
                  key={character.id}
                  className={cn(
                    'overflow-hidden rounded-[24px] border bg-background/60',
                    character.isEquipped && 'ring-2 ring-sky-300/70',
                  )}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_15%,rgba(125,211,252,0.2),transparent_58%),linear-gradient(180deg,rgba(148,163,184,0.12),rgba(148,163,184,0.04))]">
                    {character.isUnlocked ? (
                      <TalkingAvatarOverlay
                        layout="card"
                        speaking={false}
                        className="h-full"
                        modelIdOverride={character.id as 'haru' | 'hiyori' | 'mark'}
                        showBadge={false}
                      />
                    ) : (
                      <>
                        <img
                          src={character.previewSrc || ''}
                          alt={character.name}
                          className="h-full w-full object-cover opacity-55 blur-[1px]"
                        />
                        <div className="absolute inset-0 bg-slate-950/35" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-white/12 p-3 text-white backdrop-blur">
                            <Lock className="size-5" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{character.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{character.description}</p>
                      </div>
                      {character.isEquipped ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-400/12 dark:text-sky-200">
                          当前搭子
                        </span>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border bg-background/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">亲密度 Lv{character.affinityLevel}</span>
                        <span className="text-xs text-muted-foreground">{character.affinityExp} EXP</span>
                      </div>
                      <div className="mt-2">
                        <Progress
                          value={Math.max(
                            0,
                            Math.min(100, Math.round((character.affinityExp / 300) * 100)),
                          )}
                        />
                      </div>
                    </div>

                    {locked ? (
                      <div className="rounded-2xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                        {character.nextUnlockHint}
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2">
                      {locked ? (
                        <Button className="flex-1" onClick={() => void handleUnlock(character.id)}>
                          解锁 {character.unlockCostPurchaseCredits} 积分
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          variant={character.isEquipped ? 'secondary' : 'default'}
                          onClick={() => void handleEquip(character.id)}
                          disabled={character.isEquipped}
                        >
                          {character.isEquipped ? '已装备' : '设为当前搭子'}
                        </Button>
                      )}
                    </div>
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

