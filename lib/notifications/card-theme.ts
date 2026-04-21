import type { AppNotification } from '@/lib/notifications/types';

type NotificationThemePalette = {
  topLineClass: string;
  glowClass: string;
  eyebrowClass: string;
  amountPrimaryClass: string;
  amountChipClass: string;
};

const GREEN_THEME: NotificationThemePalette = {
  topLineClass: 'from-emerald-400/0 via-emerald-400/90 to-teal-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(74,222,128,0.22),transparent_48%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.2),transparent_44%)]',
  eyebrowClass: 'text-emerald-700 dark:text-emerald-200',
  amountPrimaryClass: 'bg-emerald-500/14 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-100',
  amountChipClass: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-200',
};

const BLUE_THEME: NotificationThemePalette = {
  topLineClass: 'from-sky-400/0 via-sky-400/90 to-cyan-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_48%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_44%)]',
  eyebrowClass: 'text-sky-700 dark:text-sky-200',
  amountPrimaryClass: 'bg-sky-500/14 text-sky-700 dark:bg-sky-400/16 dark:text-sky-100',
  amountChipClass: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/12 dark:text-sky-200',
};

const YELLOW_THEME: NotificationThemePalette = {
  topLineClass: 'from-amber-400/0 via-amber-400/90 to-yellow-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.2),transparent_48%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.2),transparent_44%)]',
  eyebrowClass: 'text-amber-700 dark:text-amber-200',
  amountPrimaryClass: 'bg-amber-500/14 text-amber-700 dark:bg-amber-400/16 dark:text-amber-100',
  amountChipClass: 'bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-200',
};

const PURPLE_THEME: NotificationThemePalette = {
  topLineClass: 'from-violet-400/0 via-violet-400/90 to-indigo-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.22),transparent_48%),radial-gradient(circle_at_top_right,rgba(129,140,248,0.2),transparent_44%)]',
  eyebrowClass: 'text-violet-700 dark:text-violet-200',
  amountPrimaryClass: 'bg-violet-500/14 text-violet-700 dark:bg-violet-400/16 dark:text-violet-100',
  amountChipClass: 'bg-violet-500/12 text-violet-700 dark:bg-violet-400/12 dark:text-violet-200',
};

const PINK_THEME: NotificationThemePalette = {
  topLineClass: 'from-fuchsia-400/0 via-fuchsia-400/90 to-pink-300/0',
  glowClass:
    'bg-[radial-gradient(circle_at_top_left,rgba(232,121,249,0.22),transparent_48%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.2),transparent_44%)]',
  eyebrowClass: 'text-fuchsia-700 dark:text-fuchsia-200',
  amountPrimaryClass: 'bg-fuchsia-500/14 text-fuchsia-700 dark:bg-fuchsia-400/16 dark:text-fuchsia-100',
  amountChipClass: 'bg-fuchsia-500/12 text-fuchsia-700 dark:bg-fuchsia-400/12 dark:text-fuchsia-200',
};

export function getNotificationCardTheme(
  item: Pick<AppNotification, 'sourceKind' | 'tone'> | null | undefined,
): NotificationThemePalette {
  if (!item) return GREEN_THEME;

  switch (item.sourceKind) {
    case 'LESSON_REWARD':
    case 'STREAK_BONUS':
      return GREEN_THEME;
    case 'QUIZ_COMPLETION_REWARD':
    case 'QUIZ_REWARD_GROUP':
    case 'TOKEN_USAGE_GROUP':
    case 'NOTEBOOK_GENERATION_GROUP':
      return BLUE_THEME;
    case 'DAILY_TASK_REWARD':
    case 'WELCOME_BONUS':
    case 'CASH_TO_COMPUTE_TRANSFER':
    case 'CASH_TO_PURCHASE_TRANSFER':
      return YELLOW_THEME;
    case 'REVIEW_REWARD':
      return PURPLE_THEME;
    case 'QUIZ_ACCURACY_BONUS':
      return PINK_THEME;
    default:
      return item.tone === 'negative' ? BLUE_THEME : GREEN_THEME;
  }
}
