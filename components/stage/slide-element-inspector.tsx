'use client';

import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ProsemirrorEditor } from '@/components/slide-renderer/components/element/ProsemirrorEditor';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideContent } from '@/lib/types/stage';
import type {
  PPTElement,
  PPTImageElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  PPTVideoElement,
  PPTAudioElement,
  PPTLatexElement,
} from '@/lib/types/slides';
import { cn } from '@/lib/utils';

function sectionTitle(title: string, description?: string) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description ? (
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
    </div>
  );
}

function fieldLabel(label: string) {
  return <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</Label>;
}

function getElementTypeLabel(type: PPTElement['type']): string {
  switch (type) {
    case 'text':
      return '文本';
    case 'shape':
      return '形状';
    case 'image':
      return '图片';
    case 'line':
      return '线条';
    case 'table':
      return '表格';
    case 'latex':
      return '公式';
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'chart':
      return '图表';
    default:
      return type;
  }
}

function getElementDisplayName(element: PPTElement, index: number): string {
  const explicitName = element.name?.trim();
  if (explicitName) return explicitName;
  return `${getElementTypeLabel(element.type)} ${index + 1}`;
}

function colorInput(value: string | undefined, onChange: (next: string) => void) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value && /^#([0-9a-f]{3}){1,2}$/i.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
      />
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SlideElementInspector({ className }: { readonly className?: string }) {
  const elements = useSceneSelector<SlideContent, PPTElement[]>((content) => content.canvas.elements);
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const { updateElement } = useCanvasOperations();
  const { addHistorySnapshot } = useHistorySnapshot();

  const selectedElements = useMemo(
    () => elements.filter((element) => activeElementIdList.includes(element.id)),
    [elements, activeElementIdList],
  );
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  const updateCurrentElement = useCallback(
    (props: Partial<PPTElement>, addSnapshot = false) => {
      if (!selectedElement) return;
      updateElement({ id: selectedElement.id, props });
      if (addSnapshot) void addHistorySnapshot();
    },
    [selectedElement, updateElement, addHistorySnapshot],
  );

  const updateNumberProp = useCallback(
    (prop: 'left' | 'top' | 'width' | 'height' | 'rotate', rawValue: string) => {
      const next = Number(rawValue);
      if (!Number.isFinite(next)) return;
      updateCurrentElement({ [prop]: next } as Partial<PPTElement>);
    },
    [updateCurrentElement],
  );

  const renderCommonGeometry = (element: PPTElement) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        {fieldLabel('X')}
        <Input
          type="number"
          value={element.left}
          onChange={(e) => updateNumberProp('left', e.target.value)}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('Y')}
        <Input
          type="number"
          value={element.top}
          onChange={(e) => updateNumberProp('top', e.target.value)}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('宽度')}
        <Input
          type="number"
          value={element.width}
          onChange={(e) => updateNumberProp('width', e.target.value)}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      {'height' in element ? (
        <div className="space-y-1.5">
          {fieldLabel('高度')}
          <Input
            type="number"
            value={element.height}
            onChange={(e) => updateNumberProp('height', e.target.value)}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          {fieldLabel('高度')}
          <div className="flex h-9 items-center rounded-md border border-dashed border-slate-200 px-3 text-xs text-slate-400 dark:border-white/10 dark:text-slate-500">
            由线段端点决定
          </div>
        </div>
      )}
      {'rotate' in element ? (
        <div className="space-y-1.5">
          {fieldLabel('旋转')}
          <Input
            type="number"
            value={element.rotate}
            onChange={(e) => updateNumberProp('rotate', e.target.value)}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
      ) : null}
      <div className="space-y-1.5">
        {fieldLabel('名称')}
        <Input
          value={element.name || ''}
          onChange={(e) => updateCurrentElement({ name: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          placeholder="给这个组件起个名字"
        />
      </div>
    </div>
  );

  const renderTextEditor = (element: PPTTextElement) => (
    <div className="space-y-3">
      {sectionTitle('文本内容', '右侧可直接改标题、正文和列表内容，左侧画布会实时同步。')}
      <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <ProsemirrorEditor
          elementId={`${element.id}__inspector`}
          defaultColor={element.defaultColor}
          defaultFontName={element.defaultFontName}
          value={element.content}
          editable
          onUpdate={({ value, ignore }) => {
            updateCurrentElement({ content: value });
            if (!ignore) void addHistorySnapshot();
          }}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('默认文字颜色')}
        {colorInput(element.defaultColor, (next) => updateCurrentElement({ defaultColor: next }))}
      </div>
      <div className="space-y-1.5">
        {fieldLabel('背景填充')}
        {colorInput(element.fill, (next) => updateCurrentElement({ fill: next }))}
      </div>
    </div>
  );

  const renderShapeEditor = (element: PPTShapeElement) => {
    const text = element.text;
    return (
      <div className="space-y-3">
        {sectionTitle('形状内容', '可以编辑形状本身的填充色，也可以修改形状里的文字。')}
        <div className="space-y-1.5">
          {fieldLabel('填充颜色')}
          {colorInput(element.fill, (next) => updateCurrentElement({ fill: next }))}
        </div>
        <div className="space-y-1.5">
          {fieldLabel('不透明度')}
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={element.opacity ?? 1}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ opacity: next });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        {text ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
              <ProsemirrorEditor
                elementId={`${element.id}__shape_inspector`}
                defaultColor={text.defaultColor}
                defaultFontName={text.defaultFontName}
                value={text.content}
                editable
                onUpdate={({ value, ignore }) => {
                  updateCurrentElement({
                    text: {
                      ...text,
                      content: value,
                    },
                  });
                  if (!ignore) void addHistorySnapshot();
                }}
                onBlur={() => void addHistorySnapshot()}
              />
            </div>
            <div className="space-y-1.5">
              {fieldLabel('文字垂直对齐')}
              <select
                value={text.align}
                onChange={(e) =>
                  updateCurrentElement({
                    text: {
                      ...text,
                      align: e.target.value as NonNullable<PPTShapeElement['text']>['align'],
                    },
                  }, true)
                }
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <option value="top">顶部</option>
                <option value="middle">中部</option>
                <option value="bottom">底部</option>
              </select>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              updateCurrentElement(
                {
                  text: {
                    content: '<p>请输入形状说明</p>',
                    defaultFontName: 'Arial',
                    defaultColor: '#111827',
                    align: 'middle',
                  },
                },
                true,
              )
            }
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-white/15 dark:text-slate-300 dark:hover:border-white/25 dark:hover:text-white"
          >
            为形状添加文字
          </button>
        )}
      </div>
    );
  };

  const renderLatexEditor = (element: PPTLatexElement) => (
    <div className="space-y-3">
      {sectionTitle('公式内容', '这里直接编辑 LaTeX，左侧公式会同步刷新。')}
      <Textarea
        value={element.latex}
        onChange={(e) => updateCurrentElement({ latex: e.target.value })}
        onBlur={() => void addHistorySnapshot()}
        className="min-h-[140px] font-mono text-sm"
      />
      <div className="space-y-1.5">
        {fieldLabel('对齐方式')}
        <select
          value={element.align || 'center'}
          onChange={(e) =>
            updateCurrentElement(
              { align: e.target.value as PPTLatexElement['align'] },
              true,
            )
          }
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </select>
      </div>
    </div>
  );

  const renderTableEditor = (element: PPTTableElement) => (
    <div className="space-y-3">
      {sectionTitle('表格内容', '可以逐格改表格文本，适合修正标题、数字或术语。')}
      <div className="space-y-2">
        {element.data.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="grid grid-cols-1 gap-2">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              第 {rowIndex + 1} 行
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
              {row.map((cell, colIndex) => (
                <Input
                  key={cell.id}
                  value={cell.text}
                  onChange={(e) => {
                    const nextData = element.data.map((currentRow, currentRowIndex) =>
                      currentRow.map((currentCell, currentColIndex) =>
                        currentRowIndex === rowIndex && currentColIndex === colIndex
                          ? { ...currentCell, text: e.target.value }
                          : currentCell,
                      ),
                    );
                    updateCurrentElement({ data: nextData });
                  }}
                  onBlur={() => void addHistorySnapshot()}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderImageEditor = (element: PPTImageElement) => (
    <div className="space-y-3">
      {sectionTitle('图片设置')}
      <div className="space-y-1.5">
        {fieldLabel('图片地址')}
        <Textarea
          value={element.src}
          onChange={(e) => updateCurrentElement({ src: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          className="min-h-[88px] text-xs"
        />
      </div>
      <div className="space-y-1.5">
        {fieldLabel('圆角')}
        <Input
          type="number"
          value={element.radius ?? 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isFinite(next)) return;
            updateCurrentElement({ radius: next });
          }}
          onBlur={() => void addHistorySnapshot()}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
        <div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">锁定宽高比</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">缩放时保持原图比例</div>
        </div>
        <Switch
          checked={element.fixedRatio}
          onCheckedChange={(checked) => updateCurrentElement({ fixedRatio: checked }, true)}
        />
      </div>
    </div>
  );

  const renderLineEditor = (element: PPTLineElement) => (
    <div className="space-y-3">
      {sectionTitle('线条设置')}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          {fieldLabel('起点 X')}
          <Input
            type="number"
            value={element.start[0]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ start: [next, element.start[1]] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        <div className="space-y-1.5">
          {fieldLabel('起点 Y')}
          <Input
            type="number"
            value={element.start[1]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ start: [element.start[0], next] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        <div className="space-y-1.5">
          {fieldLabel('终点 X')}
          <Input
            type="number"
            value={element.end[0]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ end: [next, element.end[1]] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
        <div className="space-y-1.5">
          {fieldLabel('终点 Y')}
          <Input
            type="number"
            value={element.end[1]}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              updateCurrentElement({ end: [element.end[0], next] });
            }}
            onBlur={() => void addHistorySnapshot()}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {fieldLabel('线条颜色')}
        {colorInput(element.color, (next) => updateCurrentElement({ color: next }))}
      </div>
      <div className="space-y-1.5">
        {fieldLabel('线条样式')}
        <select
          value={element.style}
          onChange={(e) =>
            updateCurrentElement({ style: e.target.value as PPTLineElement['style'] }, true)
          }
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="dotted">点线</option>
        </select>
      </div>
    </div>
  );

  const renderVideoEditor = (element: PPTVideoElement) => (
    <div className="space-y-3">
      {sectionTitle('视频设置')}
      <div className="space-y-1.5">
        {fieldLabel('视频地址')}
        <Textarea
          value={element.src}
          onChange={(e) => updateCurrentElement({ src: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          className="min-h-[88px] text-xs"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
        <div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">自动播放</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">进入这页后自动播放视频</div>
        </div>
        <Switch
          checked={element.autoplay}
          onCheckedChange={(checked) => updateCurrentElement({ autoplay: checked }, true)}
        />
      </div>
    </div>
  );

  const renderAudioEditor = (element: PPTAudioElement) => (
    <div className="space-y-3">
      {sectionTitle('音频设置')}
      <div className="space-y-1.5">
        {fieldLabel('音频地址')}
        <Textarea
          value={element.src}
          onChange={(e) => updateCurrentElement({ src: e.target.value })}
          onBlur={() => void addHistorySnapshot()}
          className="min-h-[88px] text-xs"
        />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">自动播放</span>
          <Switch
            checked={element.autoplay}
            onCheckedChange={(checked) => updateCurrentElement({ autoplay: checked }, true)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">循环播放</span>
          <Switch
            checked={element.loop}
            onCheckedChange={(checked) => updateCurrentElement({ loop: checked }, true)}
          />
        </div>
      </div>
    </div>
  );

  const renderElementEditor = (element: PPTElement) => {
    switch (element.type) {
      case 'text':
        return renderTextEditor(element);
      case 'shape':
        return renderShapeEditor(element);
      case 'latex':
        return renderLatexEditor(element);
      case 'table':
        return renderTableEditor(element);
      case 'image':
        return renderImageEditor(element);
      case 'line':
        return renderLineEditor(element);
      case 'video':
        return renderVideoEditor(element);
      case 'audio':
        return renderAudioEditor(element);
      default:
        return (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
            这个组件类型暂时还没有专用编辑器，当前可以先调整基础几何属性。
          </div>
        );
    }
  };

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-[360px] shrink-0 flex-col border-l border-slate-900/[0.08] bg-white/76 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0f1115]/78 xl:w-[400px]',
        className,
      )}
    >
      <div className="border-b border-slate-900/[0.06] px-4 py-4 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">页面编辑区</h2>
          <Badge variant="secondary" className="text-[10px]">
            {elements.length} 个组件
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          点击左侧 slide 上的组件，右侧会切到对应属性。当前以单元素内容编辑为主。
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-4 py-4">
          <section className="space-y-3">
            {sectionTitle('页面组件', '也可以直接在这里点选元素，快速定位到标题、公式、表格等内容。')}
            <div className="space-y-2">
              {elements.map((element, index) => {
                const isActive = activeElementIdList.includes(element.id);
                return (
                  <button
                    key={element.id}
                    type="button"
                    onClick={() => setActiveElementIdList([element.id])}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors',
                      isActive
                        ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100'
                        : 'border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/[0.05]',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {getElementDisplayName(element, index)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {getElementTypeLabel(element.type)}
                      </div>
                    </div>
                    {isActive ? <Badge className="ml-3 text-[10px]">已选中</Badge> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            {selectedElement ? (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {getElementDisplayName(
                        selectedElement,
                        elements.findIndex((item) => item.id === selectedElement.id),
                      )}
                    </h3>
                    <Badge variant="outline" className="text-[10px]">
                      {getElementTypeLabel(selectedElement.type)}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    当前选中了 1 个组件。内容修改会直接同步到左侧页面。
                  </p>
                </div>

                <div className="space-y-3">
                  {sectionTitle('基础布局')}
                  {renderCommonGeometry(selectedElement)}
                </div>

                {renderElementEditor(selectedElement)}
              </>
            ) : selectedElements.length > 1 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                当前选中了 {selectedElements.length} 个组件。右侧暂时先支持单个组件的内容与属性编辑，请在左侧画布里单选一个元素。
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-500 dark:border-white/15 dark:text-slate-400">
                还没有选中组件。可以直接点左侧 slide 上的标题、正文、公式、表格等元素，右侧就会出现对应的编辑项。
              </div>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}
