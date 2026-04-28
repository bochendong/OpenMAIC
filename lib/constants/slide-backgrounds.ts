import type { SlideBackground } from '@/lib/types/slides';

export type SlideBackgroundStyleId =
  | 'academy-watercolor'
  | 'sci-fi-data-cockpit'
  | 'deep-space-astronomy'
  | 'nature-field-notebook'
  | 'dark-tech-neural'
  | 'historical-manuscript';

export type SlideBackgroundStyleOption = {
  id: SlideBackgroundStyleId;
  label: string;
  description: string;
  src: string;
  tone: 'light' | 'dark';
};

export const DEFAULT_SLIDE_BACKGROUND_STYLE_ID: SlideBackgroundStyleId = 'academy-watercolor';

export const SLIDE_BACKGROUND_STYLE_OPTIONS: SlideBackgroundStyleOption[] = [
  {
    id: 'academy-watercolor',
    label: '学园水彩',
    description: '接近复习关卡的文具与星象边框，适合通用课程。',
    src: '/slide-backgrounds/academy-watercolor.png',
    tone: 'light',
  },
  {
    id: 'sci-fi-data-cockpit',
    label: '科幻数据舱',
    description: '浅色数据舱与悬浮面板，适合 AI、物理和工程。',
    src: '/slide-backgrounds/sci-fi-data-cockpit.png',
    tone: 'light',
  },
  {
    id: 'deep-space-astronomy',
    label: '星际宇宙',
    description: '星云与天文仪器边框，适合科学探索类内容。',
    src: '/slide-backgrounds/deep-space-astronomy.png',
    tone: 'light',
  },
  {
    id: 'nature-field-notebook',
    label: '自然生态',
    description: '植物标本与野外笔记风格，适合生物、地理和环保主题。',
    src: '/slide-backgrounds/nature-field-notebook.png',
    tone: 'light',
  },
  {
    id: 'dark-tech-neural',
    label: '暗色神经网络',
    description: '深色电路与神经网络光效，适合技术感强的章节。',
    src: '/slide-backgrounds/dark-tech-neural.png',
    tone: 'dark',
  },
  {
    id: 'historical-manuscript',
    label: '历史手稿',
    description: '羊皮纸、旧书和指南针，适合历史与人文课程。',
    src: '/slide-backgrounds/historical-manuscript.png',
    tone: 'light',
  },
];

const SLIDE_BACKGROUND_STYLE_IDS = new Set(
  SLIDE_BACKGROUND_STYLE_OPTIONS.map((option) => option.id),
);

export function isValidSlideBackgroundStyleId(value: unknown): value is SlideBackgroundStyleId {
  return (
    typeof value === 'string' && SLIDE_BACKGROUND_STYLE_IDS.has(value as SlideBackgroundStyleId)
  );
}

export function getSlideBackgroundStyleOption(
  id: SlideBackgroundStyleId,
): SlideBackgroundStyleOption {
  return (
    SLIDE_BACKGROUND_STYLE_OPTIONS.find((option) => option.id === id) ??
    SLIDE_BACKGROUND_STYLE_OPTIONS[0]
  );
}

export function slideBackgroundStyleCosmeticKey(id: SlideBackgroundStyleId): string {
  return `slide-background:${id}`;
}

export function getSlideBackgroundForStyle(id: SlideBackgroundStyleId): SlideBackground {
  const option = getSlideBackgroundStyleOption(id);
  return {
    type: 'image',
    image: {
      src: option.src,
      size: 'cover',
    },
  };
}

export function shouldApplyProfileSlideBackground(
  background: SlideBackground | undefined,
): boolean {
  if (!background) return true;
  return background.type !== 'image';
}

export function resolveEffectiveSlideBackground(
  background: SlideBackground | undefined,
  styleId: SlideBackgroundStyleId,
): SlideBackground {
  if (background && !shouldApplyProfileSlideBackground(background)) return background;
  return getSlideBackgroundForStyle(styleId);
}
