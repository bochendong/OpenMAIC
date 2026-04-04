'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ComposerVoiceSelector } from '@/components/generation/generation-toolbar';
import type { SettingsSection } from '@/lib/types/settings';
import {
  useOrchestratorNotebookGenStore,
  type OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useCurrentCourseStore } from '@/lib/store/current-course';
import { getCourse } from '@/lib/utils/course-storage';
import type { CoursePurpose } from '@/lib/utils/database';
import { cn } from '@/lib/utils';
import type { NotebookGenerationModelStage } from '@/lib/constants/notebook-generation-model-stages';
import {
  NOTEBOOK_MODEL_PRESET_FULL,
  type NotebookGenerationModelMode,
} from '@/lib/constants/notebook-generation-model-presets';

function defaultWorkedExampleLevelForPurpose(purpose: CoursePurpose | null): OrchestratorWorkedExampleLevel {
  if (purpose === 'university') return 'heavy';
  if (purpose === 'research' || purpose === 'daily') return 'none';
  return 'moderate';
}

function defaultIncludeQuizScenesForPurpose(purpose: CoursePurpose | null): boolean {
  if (purpose === 'research' || purpose === 'daily') return false;
  return true;
}

/** 仅在新进入某门课程时写入用途相关默认档，避免每次展开侧栏覆盖用户手选 */
let lastPurposeDefaultsCourseId: string | null = null;

/** 与 `SelectTrigger`（sm / h-8）一致：侧栏内模型、语言、篇幅、音色同一套「表单行」样式 */
const SIDEBAR_CHOICE_TRIGGER =
  'h-8 w-full min-w-0 gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-xs font-normal shadow-xs dark:bg-input/30 dark:hover:bg-input/50';
const FOLLOW_CURRENT_MODEL = '__follow_current_model__';

const NOTEBOOK_STAGE_MODEL_LABELS: Record<NotebookGenerationModelStage, string> = {
  metadata: '标题与简介',
  agents: '讲解角色',
  outlines: '课程大纲',
  content: '页面内容',
  actions: '讲解与口播',
};

const NOTEBOOK_STAGE_ORDER: NotebookGenerationModelStage[] = [
  'metadata',
  'agents',
  'outlines',
  'content',
  'actions',
];

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] font-semibold text-foreground/90">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * 课程总控「生成笔记本」模式下右侧栏：与发送时 `runNotebookGenerationTask` 读取的 store 一致。
 */
export function OrchestratorGenerateOptionsPanel({ className }: { className?: string }) {
  const router = useRouter();
  const openSettings = (section?: SettingsSection) => {
    if (section) router.push(`/settings?section=${encodeURIComponent(section)}`);
    else router.push('/settings');
  };

  const notebookModelMode = useOrchestratorNotebookGenStore((s) => s.notebookModelMode);
  const setNotebookModelMode = useOrchestratorNotebookGenStore((s) => s.setNotebookModelMode);
  const setModelIdOverride = useOrchestratorNotebookGenStore((s) => s.setModelIdOverride);
  const notebookStageModelOverrides = useOrchestratorNotebookGenStore((s) => s.notebookStageModelOverrides);
  const setNotebookStageModelOverride = useOrchestratorNotebookGenStore(
    (s) => s.setNotebookStageModelOverride,
  );
  const language = useOrchestratorNotebookGenStore((s) => s.language);
  const setLanguage = useOrchestratorNotebookGenStore((s) => s.setLanguage);
  const webSearch = useOrchestratorNotebookGenStore((s) => s.webSearch);
  const setWebSearch = useOrchestratorNotebookGenStore((s) => s.setWebSearch);
  const outlineLength = useOrchestratorNotebookGenStore((s) => s.outlineLength);
  const setOutlineLength = useOrchestratorNotebookGenStore((s) => s.setOutlineLength);
  const workedExampleLevel = useOrchestratorNotebookGenStore((s) => s.workedExampleLevel);
  const setWorkedExampleLevel = useOrchestratorNotebookGenStore((s) => s.setWorkedExampleLevel);
  const includeQuizScenes = useOrchestratorNotebookGenStore((s) => s.includeQuizScenes);
  const setIncludeQuizScenes = useOrchestratorNotebookGenStore((s) => s.setIncludeQuizScenes);
  const useAiImages = useOrchestratorNotebookGenStore((s) => s.useAiImages);
  const setUseAiImages = useOrchestratorNotebookGenStore((s) => s.setUseAiImages);

  const currentModelId = useSettingsStore((s) => s.modelId);
  const openaiConfig = useSettingsStore((s) => s.providersConfig.openai);
  const openaiModels = openaiConfig?.models ?? [];

  const courseId = useCurrentCourseStore((s) => s.id);

  useEffect(() => {
    if (!courseId?.trim()) return;
    const cid = courseId.trim();
    let alive = true;
    void getCourse(cid).then((c) => {
      if (!alive) return;
      if (lastPurposeDefaultsCourseId === cid) return;
      lastPurposeDefaultsCourseId = cid;
      const purpose = c?.purpose ?? null;
      setWorkedExampleLevel(defaultWorkedExampleLevelForPurpose(purpose));
      setIncludeQuizScenes(defaultIncludeQuizScenesForPurpose(purpose));
    });
    return () => {
      alive = false;
    };
  }, [courseId, setIncludeQuizScenes, setWorkedExampleLevel]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto px-0.5 pb-2', className)}>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-900/[0.06] bg-white/40 p-3 dark:border-white/[0.08] dark:bg-black/20">
        <FieldBlock label="模型策略">
          <div className="w-full">
            <Select
              value={notebookModelMode}
              onValueChange={(v) => {
                const mode = v as NotebookGenerationModelMode;
                if (mode === 'custom') {
                  setModelIdOverride(null);
                }
                setNotebookModelMode(mode);
              }}
            >
              <SelectTrigger size="sm" className={SIDEBAR_CHOICE_TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended" textValue="默认推荐">
                  默认（推荐搭配）
                </SelectItem>
                <SelectItem value="custom" textValue="自定义">
                  自定义
                </SelectItem>
                <SelectItem value="max" textValue="Max">
                  Max（全程 {NOTEBOOK_MODEL_PRESET_FULL}）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FieldBlock>

        {notebookModelMode === 'custom' && (
          <FieldBlock label="分阶段模型">
            <div className="flex w-full flex-col gap-2.5">
              {NOTEBOOK_STAGE_ORDER.map((stage) => {
                const picked = notebookStageModelOverrides[stage]?.trim() || null;
                return (
                  <div key={stage} className="flex flex-col gap-1">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      {NOTEBOOK_STAGE_MODEL_LABELS[stage]}
                    </Label>
                    <Select
                      value={picked ?? FOLLOW_CURRENT_MODEL}
                      onValueChange={(value) => {
                        setNotebookStageModelOverride(
                          stage,
                          value === FOLLOW_CURRENT_MODEL ? null : value,
                        );
                      }}
                    >
                      <SelectTrigger size="sm" className={SIDEBAR_CHOICE_TRIGGER}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FOLLOW_CURRENT_MODEL}>
                          跟随当前模型（{currentModelId}）
                        </SelectItem>
                        {openaiModels.map((model) => (
                          <SelectItem key={`${stage}-${model.id}`} value={model.id}>
                            {model.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </FieldBlock>
        )}

        <FieldBlock label="课程语言">
          <Select value={language} onValueChange={(v) => setLanguage(v as 'zh-CN' | 'en-US')}>
            <SelectTrigger size="sm" className={SIDEBAR_CHOICE_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">中文</SelectItem>
              <SelectItem value="en-US">English</SelectItem>
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock label="篇幅">
          <Select value={outlineLength} onValueChange={(v) => setOutlineLength(v as typeof outlineLength)}>
            <SelectTrigger size="sm" className={SIDEBAR_CHOICE_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal" textValue="极简">
                极简（5 页以下）
              </SelectItem>
              <SelectItem value="compact" textValue="简短">
                简短（10 页以下）
              </SelectItem>
              <SelectItem value="standard" textValue="中等">
                中等（10–20 页）
              </SelectItem>
              <SelectItem value="extended" textValue="深入">
                深入（20 页以上）
              </SelectItem>
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock label="例题数量">
          <Select
            value={workedExampleLevel ?? 'moderate'}
            onValueChange={(v) => setWorkedExampleLevel(v as OrchestratorWorkedExampleLevel)}
          >
            <SelectTrigger size="sm" className={SIDEBAR_CHOICE_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" textValue="无">
                无（不讲完整例题走读）
              </SelectItem>
              <SelectItem value="light" textValue="少量">
                少量（约 0–1 组完整例题）
              </SelectItem>
              <SelectItem value="moderate" textValue="中等">
                中等（约 2–4 组）
              </SelectItem>
              <SelectItem value="heavy" textValue="丰富">
                丰富（约 5 组及以上）
              </SelectItem>
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock label="朗读音色">
          <ComposerVoiceSelector
            onSettingsOpen={openSettings}
            triggerClassName={SIDEBAR_CHOICE_TRIGGER}
          />
        </FieldBlock>

        <div className="flex flex-col gap-3 border-t border-slate-900/[0.06] pt-3 dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-[11px] font-semibold">联网搜索</Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">创建前补充外部资料（需配置搜索提供商）。</p>
            </div>
            <Switch checked={webSearch} onCheckedChange={setWebSearch} aria-label="联网搜索" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-[11px] font-semibold">AI 生成配图</Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">允许在大纲中规划 AI 插图（仍受设置里图像模型影响）。</p>
            </div>
            <Switch checked={useAiImages} onCheckedChange={setUseAiImages} aria-label="AI 生成配图" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-[11px] font-semibold">包含测验 / 题目页</Label>
              <p className="mt-0.5 text-[10px] text-muted-foreground">关闭则尽量不生成独立 quiz 场景，以讲解 slide 为主。</p>
            </div>
            <Switch checked={includeQuizScenes} onCheckedChange={setIncludeQuizScenes} aria-label="包含测验场景" />
          </div>
        </div>
      </div>
    </div>
  );
}
