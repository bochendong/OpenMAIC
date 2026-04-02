import {
  inferNotebookContentProfileFromText,
  type NotebookContentProfile,
} from '@/lib/notebook-content';
import type { SceneOutline } from '@/lib/types/generation';

function collectOutlineSignals(outline: SceneOutline): string[] {
  const signals = [outline.title, outline.description, ...(outline.keyPoints || [])];
  const cfg = outline.workedExampleConfig;

  if (cfg) {
    signals.push(cfg.kind, cfg.role);
    if (cfg.problemStatement) signals.push(cfg.problemStatement);
    if (cfg.givens?.length) signals.push(...cfg.givens);
    if (cfg.asks?.length) signals.push(...cfg.asks);
    if (cfg.constraints?.length) signals.push(...cfg.constraints);
    if (cfg.solutionPlan?.length) signals.push(...cfg.solutionPlan);
    if (cfg.walkthroughSteps?.length) signals.push(...cfg.walkthroughSteps);
    if (cfg.commonPitfalls?.length) signals.push(...cfg.commonPitfalls);
    if (cfg.finalAnswer) signals.push(cfg.finalAnswer);
    if (cfg.codeSnippet) signals.push(cfg.codeSnippet);
  }

  return signals.filter(Boolean);
}

export function inferSceneContentProfile(outline: SceneOutline): NotebookContentProfile {
  if (outline.contentProfile) return outline.contentProfile;

  if (outline.type !== 'slide') {
    if (
      outline.type === 'quiz' &&
      outline.quizConfig?.questionTypes.some((type) => type === 'code' || type === 'code_tracing')
    ) {
      return 'code';
    }
    return 'general';
  }

  const workedExampleKind = outline.workedExampleConfig?.kind;
  if (workedExampleKind === 'code') return 'code';
  if (workedExampleKind === 'math' || workedExampleKind === 'proof') return 'math';

  return inferNotebookContentProfileFromText(collectOutlineSignals(outline).join('\n'));
}

export function normalizeSceneOutlineContentProfile(outline: SceneOutline): SceneOutline {
  return {
    ...outline,
    contentProfile: inferSceneContentProfile(outline),
  };
}

export function formatContentProfileForPrompt(
  profile: NotebookContentProfile,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (language === 'zh-CN') {
    const detail =
      profile === 'code'
        ? [
            '内容 profile：code',
            '- 这是编程 / 算法讲解页。',
            '- 优先保留代码结构、执行顺序、变量状态变化、输入输出示例与调试思路。',
            '- 不要把代码讲解压扁成抽象 bullet；能用 code_walkthrough 就不要只给 paragraph。',
          ]
        : profile === 'math'
          ? [
              '内容 profile：math',
              '- 这是公式 / 证明 / 矩阵 / 推导类页面。',
              '- 优先保留符号结构、矩阵结构、推导链与关键中间结果。',
              '- 不要把公式或矩阵压扁成摘要句子；能用 equation / matrix / derivation_steps 就不要只给 paragraph。',
            ]
          : [
              '内容 profile：general',
              '- 这是通用概念讲解页。',
              '- 以清晰结构和可读性为主；只有在确实需要时才使用公式或代码专用块。',
            ];

    return detail.join('\n');
  }

  if (profile === 'code') {
    return [
      'Content profile: code',
      '- This slide is primarily a programming / algorithm explanation.',
      '- Preserve code structure, execution order, variable-state changes, IO examples, and debugging logic.',
      '- Prefer code_walkthrough over flattening the explanation into abstract bullets.',
    ].join('\n');
  }

  if (profile === 'math') {
    return [
      'Content profile: math',
      '- This slide is primarily formula / proof / matrix / derivation content.',
      '- Preserve symbolic structure, matrix layout, derivation flow, and key intermediate results.',
      '- Prefer equation / matrix / derivation_steps over flattening formulas into prose.',
    ].join('\n');
  }

  return [
    'Content profile: general',
    '- This slide is primarily a general concept explanation.',
    '- Optimize for clear structure and readability; only use math/code-specific blocks when truly needed.',
  ].join('\n');
}
