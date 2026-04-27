import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SceneType } from '@/lib/types/stage';
import type { RawSlideDataView } from '@/components/stage/raw-view-helpers';

export function RawDataPanel({
  rawDataTabTypes,
  rawDataSubTab,
  onRawDataSubTabChange,
  rawSlideDataView,
  onRawSlideDataViewChange,
  rawDataCaption,
  sceneTypeLabel,
  canReflowCurrentGridScene,
  canReflowCurrentLayoutCardsScene,
  gridReflowPending,
  onReflowCurrentGridScene,
  onReflowCurrentLayoutCardsScene,
  rawTypePayloadJson,
}: {
  rawDataTabTypes: SceneType[];
  rawDataSubTab: SceneType;
  onRawDataSubTabChange: (tab: SceneType) => void;
  rawSlideDataView: RawSlideDataView;
  onRawSlideDataViewChange: (view: RawSlideDataView) => void;
  rawDataCaption: string;
  sceneTypeLabel: (tabType: SceneType) => string;
  canReflowCurrentGridScene: boolean;
  canReflowCurrentLayoutCardsScene: boolean;
  gridReflowPending: boolean;
  onReflowCurrentGridScene: () => void;
  onReflowCurrentLayoutCardsScene: () => void;
  rawTypePayloadJson: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <div
          className="flex flex-wrap gap-0.5 rounded-lg bg-white/5 p-0.5"
          role="tablist"
          aria-label={rawDataCaption}
        >
          {rawDataTabTypes.map((tabType) => (
            <button
              key={tabType}
              type="button"
              role="tab"
              aria-selected={rawDataSubTab === tabType}
              onClick={() => onRawDataSubTabChange(tabType)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                rawDataSubTab === tabType
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {sceneTypeLabel(tabType)}
            </button>
          ))}
        </div>
        {rawDataSubTab === 'slide' ? (
          <div
            className="flex flex-wrap gap-0.5 rounded-lg bg-white/5 p-0.5"
            role="tablist"
            aria-label="幻灯片原始数据视图"
          >
            <RawSlideDataButton
              active={rawSlideDataView === 'generated'}
              onClick={() => onRawSlideDataViewChange('generated')}
            >
              生成数据
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'outline'}
              onClick={() => onRawSlideDataViewChange('outline')}
            >
              大纲
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'narration'}
              onClick={() => onRawSlideDataViewChange('narration')}
            >
              讲解数据
            </RawSlideDataButton>
            <RawSlideDataButton
              active={rawSlideDataView === 'ui'}
              onClick={() => onRawSlideDataViewChange('ui')}
            >
              UI计算
            </RawSlideDataButton>
            <button
              type="button"
              onClick={onReflowCurrentGridScene}
              disabled={!canReflowCurrentGridScene || gridReflowPending}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                canReflowCurrentGridScene && !gridReflowPending
                  ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  : 'cursor-not-allowed text-slate-500',
              )}
            >
              {gridReflowPending ? '重排中…' : '仅重排 Grid'}
            </button>
            <button
              type="button"
              onClick={onReflowCurrentLayoutCardsScene}
              disabled={!canReflowCurrentLayoutCardsScene || gridReflowPending}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                canReflowCurrentLayoutCardsScene && !gridReflowPending
                  ? 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
                  : 'cursor-not-allowed text-slate-500',
              )}
            >
              {gridReflowPending ? '重排中…' : '仅重排 Layout Cards'}
            </button>
          </div>
        ) : null}
        <p className="ml-auto min-w-0 text-[10px] text-slate-500">{rawDataCaption}</p>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
        {rawTypePayloadJson}
      </pre>
    </div>
  );
}

function RawSlideDataButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
        active ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200',
      )}
    >
      {children}
    </button>
  );
}
