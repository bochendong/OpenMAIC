'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import { useGamificationSummary } from '@/lib/hooks/use-gamification-summary';

function isCustomAvatar(avatar: string) {
  return avatar.startsWith('data:');
}

type ProfileAvatarPickerProps = {
  /** 头像圆尺寸，默认适合卡片内 */
  size?: 'md' | 'lg';
  className?: string;
};

export function ProfileAvatarPicker({ size = 'md', className }: ProfileAvatarPickerProps) {
  const avatar = useUserProfileStore((s) => s.avatar);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const { summary } = useGamificationSummary(true);
  const [page, setPage] = useState(0);

  const ring = size === 'lg' ? 'size-24' : 'size-11';
  const chip = size === 'lg' ? 'size-16' : 'size-8';
  const unlockedAvatarOptions =
    summary?.databaseEnabled && summary.avatarInventory.items.length > 0
      ? summary.avatarInventory.items.filter((item) => item.owned).map((item) => item.url)
      : AVATAR_OPTIONS;
  const availableAvatarOptions =
    !isCustomAvatar(avatar) && avatar && !unlockedAvatarOptions.includes(avatar)
      ? [avatar, ...unlockedAvatarOptions]
      : unlockedAvatarOptions;
  const avatarsPerPage = size === 'lg' ? 15 : 9;
  const totalPages = Math.max(1, Math.ceil(availableAvatarOptions.length / avatarsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * avatarsPerPage;
  const visibleAvatars = availableAvatarOptions.slice(pageStart, pageStart + avatarsPerPage);

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            'shrink-0 rounded-full bg-gray-50 dark:bg-gray-800 overflow-hidden ring-2 ring-violet-300/50 dark:ring-violet-600/40',
            ring,
          )}
          aria-hidden
        >
          <img src={avatar} alt="" className="size-full object-cover" />
        </div>
        <p className="text-xs text-muted-foreground">当前头像</p>
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5',
          size === 'lg' ? 'min-h-[12rem] gap-2.5' : undefined,
        )}
      >
        {visibleAvatars.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => setAvatar(url)}
            className={cn(
              'rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
              'hover:scale-110 active:scale-95',
              chip,
              avatar === url
                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-background'
                : 'hover:ring-1 hover:ring-muted-foreground/30',
            )}
            aria-label="选择此预设头像"
            aria-pressed={avatar === url}
          >
            <img src={url} alt="" className="size-full" />
          </button>
        ))}
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="rounded-md border border-border/70 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
          >
            上一页
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-md border border-border/70 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
