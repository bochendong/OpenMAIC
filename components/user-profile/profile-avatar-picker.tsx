'use client';

import { useState, useEffect, useId } from 'react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';

function isCustomAvatar(avatar: string) {
  return avatar.startsWith('data:');
}

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

type ProfileAvatarPickerProps = {
  /** 头像圆尺寸，默认适合卡片内 */
  size?: 'md' | 'lg';
  className?: string;
};

export function ProfileAvatarPicker({ size = 'md', className }: ProfileAvatarPickerProps) {
  const { t } = useI18n();
  const inputId = useId();
  const fileInputId = `${inputId}-avatar-file`;
  const avatar = useUserProfileStore((s) => s.avatar);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const ring = size === 'lg' ? 'size-16' : 'size-11';
  const chip = size === 'lg' ? 'size-10' : 'size-8';
  const avatarsPerPage = size === 'lg' ? 11 : 9;
  const totalPages = Math.max(1, Math.ceil(AVATAR_OPTIONS.length / avatarsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * avatarsPerPage;
  const visibleAvatars = AVATAR_OPTIONS.slice(pageStart, pageStart + avatarsPerPage);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!hydrated) {
    return (
      <div className={cn('flex min-w-0 flex-col gap-3', className)}>
        <div className={cn('shrink-0 rounded-full bg-muted animate-pulse', ring)} />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={cn('rounded-full bg-muted animate-pulse', chip)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <input
        id={fileInputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleAvatarUpload}
      />

      <div
        className={cn(
          'shrink-0 rounded-full bg-gray-50 dark:bg-gray-800 overflow-hidden ring-2 ring-violet-300/50 dark:ring-violet-600/40',
          ring,
        )}
        aria-hidden
      >
        <img src={avatar} alt="" className="size-full object-cover" />
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5',
          size === 'lg' ? 'min-h-[6rem]' : undefined,
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

        <label
          htmlFor={fileInputId}
          className={cn(
            'rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
            'hover:scale-110 active:scale-95',
            chip,
            isCustomAvatar(avatar)
              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-1 ring-offset-background border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
          )}
          title={t('profile.uploadAvatar')}
        >
          <ImagePlus className="size-3.5" />
        </label>
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
