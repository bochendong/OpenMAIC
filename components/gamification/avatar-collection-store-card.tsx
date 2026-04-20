'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';

export function AvatarCollectionStoreCard() {
  const { summary, loading, unlockCharacter } = useGamificationSummary(true);

  const avatarCollections =
    summary?.characters.filter((character) => character.assetType === 'AVATAR') ?? [];

  const handleUnlock = async (characterId: string) => {
    try {
      await unlockCharacter(characterId);
      toast.success('已解锁收藏头像包');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解锁收藏包失败');
    }
  };

  return (
    <Card className="p-5 !gap-0 border-muted/40 bg-white/85 backdrop-blur-xl dark:bg-slate-900/80">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 text-fuchsia-500" />
          <div>
            <h2 className="text-base font-semibold text-foreground">收藏头像包</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              现有 R / SR / SSR 头像资源会作为次级收藏奖励，先做成直购解锁。
            </p>
          </div>
        </div>
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {!summary ? null : !summary.databaseEnabled ? (
        <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
          当前环境还没有数据库同步，收藏头像解锁暂时不可用。
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {avatarCollections.map((collection) => (
            <div key={collection.id} className="rounded-2xl border bg-background/60 p-4">
              <img
                src={collection.previewSrc || ''}
                alt={collection.name}
                className="aspect-square w-full rounded-2xl object-cover"
              />
              <p className="mt-3 text-sm font-semibold">{collection.collectionLabel || collection.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{collection.description}</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>需求 Lv{collection.affinityLevelRequired}</span>
                <span>{collection.unlockCostPurchaseCredits} 购买积分</span>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  className="w-full"
                  variant={collection.isUnlocked ? 'secondary' : 'default'}
                  disabled={collection.isUnlocked}
                  onClick={() => void handleUnlock(collection.id)}
                >
                  {collection.isUnlocked ? '已解锁' : '解锁收藏包'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
