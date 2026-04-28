import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import { createTextElement } from '@/lib/notebook-content/slide-element-factory';
import { escapeHtml } from '@/lib/notebook-content/inline-html';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { SlideTheme } from '@/lib/types/slides';

export const TITLE_COVER_OUTLINE_ID = 'scene_title_cover';

const TITLE_COVER_MARKER = 'syntara:title-only-cover';

function getTitleSize(title: string): number {
  const compactLength = title.replace(/\s+/g, '').length;
  if (compactLength > 34) return 34;
  if (compactLength > 26) return 38;
  if (compactLength > 18) return 43;
  return 50;
}

function escapeSyntaraOption(value: string): string {
  return value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function resolveCoverTitle(args: {
  title?: string;
  firstOutline?: SceneOutline;
  language: 'zh-CN' | 'en-US';
}): string {
  const fromStage = args.title?.trim();
  if (fromStage) return fromStage;

  const fromOutline = args.firstOutline?.title?.trim();
  if (fromOutline) return fromOutline;

  return args.language === 'en-US' ? 'Untitled Lesson' : '未命名课程';
}

function shouldSkipCoverInsert(outlines: SceneOutline[]): boolean {
  const first = outlines[0];
  if (!first) return false;
  return isTitleCoverOutline(first);
}

function demoteOldCoverIntent(outline: SceneOutline): SceneOutline {
  const intent = outline.layoutIntent;
  const isOldCover =
    intent?.layoutFamily === 'cover' ||
    intent?.layoutTemplate === 'cover_hero' ||
    outline.archetype === 'intro';

  if (!isOldCover) return outline;

  const template = (outline.keyPoints?.length || 0) >= 3 ? 'three_cards' : 'title_content';
  return {
    ...outline,
    layoutIntent: {
      ...(intent || {}),
      layoutFamily: 'concept_cards',
      layoutTemplate: template,
      density: intent?.density === 'light' ? 'standard' : intent?.density,
    },
  };
}

export function isTitleCoverOutline(outline: SceneOutline | undefined | null): boolean {
  if (!outline) return false;
  return (
    outline.id === TITLE_COVER_OUTLINE_ID ||
    outline.teachingObjective === TITLE_COVER_MARKER ||
    (outline.layoutIntent?.layoutFamily === 'cover' &&
      outline.layoutIntent?.layoutTemplate === 'cover_hero' &&
      outline.keyPoints.length === 0 &&
      outline.description.trim() === '')
  );
}

export function ensureTitleCoverOutline(
  outlines: SceneOutline[],
  args: {
    title?: string;
    language?: 'zh-CN' | 'en-US';
  } = {},
): SceneOutline[] {
  if (!outlines.length) return outlines;
  if (shouldSkipCoverInsert(outlines)) {
    return outlines.map((outline, index) =>
      normalizeSceneOutlineContentProfile({
        ...outline,
        order: index + 1,
      }),
    );
  }

  const language = args.language || outlines[0]?.language || 'zh-CN';
  const coverTitle = resolveCoverTitle({
    title: args.title,
    firstOutline: outlines[0],
    language,
  });

  const cover = normalizeSceneOutlineContentProfile({
    id: TITLE_COVER_OUTLINE_ID,
    type: 'slide',
    contentProfile: outlines[0]?.contentProfile || 'general',
    archetype: 'intro',
    layoutIntent: {
      layoutFamily: 'cover',
      layoutTemplate: 'cover_hero',
      disciplineStyle: outlines[0]?.layoutIntent?.disciplineStyle || 'general',
      teachingFlow: 'standalone',
      density: 'light',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    },
    title: coverTitle,
    description: '',
    keyPoints: [],
    teachingObjective: TITLE_COVER_MARKER,
    estimatedDuration: 20,
    order: 1,
    language,
  });

  const shifted = outlines.map((outline, index) =>
    normalizeSceneOutlineContentProfile({
      ...demoteOldCoverIntent(outline),
      order: index + 2,
      language: outline.language || language,
    }),
  );

  return [cover, ...shifted];
}

export function buildTitleCoverSlideContent(outline: SceneOutline): GeneratedSlideContent {
  const title =
    outline.title.trim() || (outline.language === 'en-US' ? 'Untitled Lesson' : '未命名课程');
  const titleSize = getTitleSize(title);
  const theme: SlideTheme = {
    backgroundColor: '#ffffff',
    themeColors: ['#4b72e8', '#8a6fe8', '#27b889', '#d6a84f', '#182033'],
    fontColor: '#182033',
    fontName: 'Microsoft YaHei',
  };

  return {
    elements: [
      createTextElement({
        left: 92,
        top: 218,
        width: 816,
        height: 132,
        html: `<p style="margin:0;text-align:center;font-size:${titleSize}px;line-height:${Math.round(
          titleSize * 1.16,
        )}px;color:#182033;font-weight:850;">${escapeHtml(title)}</p>`,
        color: '#182033',
        textType: 'title',
      }),
    ],
    theme,
    remark: title,
    syntaraMarkup: `\\begin{slide}[title={${escapeSyntaraOption(
      title,
    )}},template=cover_hero,density=light,profile=${outline.contentProfile || 'general'},language=${
      outline.language || 'zh-CN'
    }]\n\\end{slide}`,
  };
}
