import { renderSemanticSlideContent } from '@/lib/notebook-content/semantic-slide-render';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene, SceneType } from '@/lib/types/stage';
import { RAW_DATA_BASE_TYPES, serializeSceneForRawView } from '@/components/stage/stage-helpers';

export type RawSlideDataView = 'generated' | 'outline' | 'narration' | 'ui';

export function getRawDataTabTypes(outlines: SceneOutline[], scenes: Scene[]): SceneType[] {
  const present = new Set<SceneType>();
  for (const outline of outlines) present.add(outline.type);
  for (const scene of scenes) present.add(scene.type);
  const extras = [...present].filter((type) => !RAW_DATA_BASE_TYPES.includes(type)).sort();
  return [...RAW_DATA_BASE_TYPES, ...extras];
}

export function getRawCurrentScene(currentScene: Scene | null | undefined, tabType: SceneType) {
  if (currentScene && currentScene.type === tabType) return currentScene;
  return null;
}

export function getRawCurrentOutline(
  outlines: SceneOutline[],
  scene: Scene | null,
  tabType: SceneType,
) {
  if (!scene) return null;
  const byOrder = outlines.find((outline) => outline.type === tabType && outline.order === scene.order);
  if (byOrder) return byOrder;
  return (
    outlines.find(
      (outline) =>
        outline.type === tabType &&
        outline.title.trim().toLowerCase() === scene.title.trim().toLowerCase(),
    ) || null
  );
}

export function canReflowGridScene(scene: Scene | null): boolean {
  if (!scene || scene.type !== 'slide' || scene.content.type !== 'slide') return false;
  return scene.content.semanticDocument?.layout?.mode === 'grid';
}

export function canReflowLayoutCardsScene(scene: Scene | null): boolean {
  if (!scene || scene.type !== 'slide' || scene.content.type !== 'slide') return false;
  return Boolean(
    scene.content.semanticDocument?.blocks.some((block) => block.type === 'layout_cards'),
  );
}

export function renderReflowedGridScene(scene: Scene) {
  if (!canReflowGridScene(scene) || scene.type !== 'slide' || scene.content.type !== 'slide') {
    return null;
  }
  const semanticDocument = scene.content.semanticDocument;
  if (!semanticDocument) return null;
  return renderSemanticSlideContent({
    document: semanticDocument,
    fallbackTitle: semanticDocument.title || scene.title,
    preserveCanvasId: scene.content.canvas.id,
  });
}

export function renderReflowedLayoutCardsScene(scene: Scene) {
  if (
    !canReflowLayoutCardsScene(scene) ||
    scene.type !== 'slide' ||
    scene.content.type !== 'slide'
  ) {
    return null;
  }
  const semanticDocument = scene.content.semanticDocument;
  if (!semanticDocument) return null;
  return renderSemanticSlideContent({
    document: semanticDocument,
    fallbackTitle: semanticDocument.title || scene.title,
    preserveCanvasId: scene.content.canvas.id,
  });
}

export function buildRawTypePayloadJson(args: {
  currentSceneId: string | null;
  rawDataSubTab: SceneType;
  rawSlideDataView: RawSlideDataView;
  rawCurrentOutline: SceneOutline | null;
  rawCurrentScene: Scene | null;
}): string {
  try {
    const type = args.rawDataSubTab;
    const scene = args.rawCurrentScene;
    const scenePayload = !scene
      ? null
      : type === 'slide'
        ? buildSlideRawPayload({
            scene,
            view: args.rawSlideDataView,
            outline: args.rawCurrentOutline,
            currentSceneId: args.currentSceneId,
          })
        : serializeSceneForRawView(scene);

    return JSON.stringify(
      {
        type,
        view: type === 'slide' ? args.rawSlideDataView : 'default',
        sceneId: scene?.id ?? null,
        outline: args.rawCurrentOutline,
        scene: scenePayload,
      },
      null,
      2,
    );
  } catch {
    return '{"error":"serialize_failed"}';
  }
}

function buildSlideRawPayload(args: {
  scene: Scene;
  view: RawSlideDataView;
  outline: SceneOutline | null;
  currentSceneId: string | null;
}) {
  const { scene, view, outline, currentSceneId } = args;
  if (view === 'generated') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      content: scene.content,
    };
  }

  if (view === 'outline') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      outline,
    };
  }

  if (view === 'narration') {
    return {
      id: scene.id,
      type: scene.type,
      title: scene.title,
      order: scene.order,
      actions: scene.actions || [],
    };
  }

  const serialized = serializeSceneForRawView(scene, {
    expandSlideCanvas: scene.id === currentSceneId && scene.content.type === 'slide',
  }) as Record<string, unknown>;
  const actions = Array.isArray(scene.actions) ? scene.actions : [];
  return {
    ...serialized,
    actionsSummary: {
      total: actions.length,
      speech: actions.filter((action) => action.type === 'speech').length,
      spotlight: actions.filter((action) => action.type === 'spotlight').length,
      laser: actions.filter((action) => action.type === 'laser').length,
    },
  };
}
