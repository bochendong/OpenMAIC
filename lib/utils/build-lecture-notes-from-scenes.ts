import type { LectureNoteEntry } from '@/lib/types/chat';
import type { Scene } from '@/lib/types/stage';
import type { DiscussionAction, SpeechAction } from '@/lib/types/action';

/** 与 ChatArea「笔记」Tab 一致：从场景 actions 生成授课笔记列表 */
export function buildLectureNotesFromScenes(scenes: Scene[]): LectureNoteEntry[] {
  return scenes
    .filter((scene) => scene.actions && scene.actions.length > 0)
    .map((scene) => ({
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneOrder: scene.order,
      items: scene
        .actions!.filter(
          (a) =>
            a.type === 'speech' ||
            a.type === 'spotlight' ||
            a.type === 'laser' ||
            a.type === 'play_video' ||
            a.type === 'discussion',
        )
        .map((a) => {
          if (a.type === 'speech') {
            return {
              kind: 'speech' as const,
              text: (a as SpeechAction).text,
            };
          }
          return {
            kind: 'action' as const,
            type: a.type,
            label: a.type === 'discussion' ? (a as DiscussionAction).topic : undefined,
          };
        }),
      completedAt: scene.updatedAt || scene.createdAt || 0,
    }))
    .sort((a, b) => a.sceneOrder - b.sceneOrder);
}
