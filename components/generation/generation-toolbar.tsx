'use client';

import { useState, useRef, useMemo } from 'react';
import { Globe, Paperclip, FileText, X, Globe2, Volume2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import type { SettingsSection } from '@/lib/types/settings';
import { MediaPopover } from '@/components/generation/media-popover';
import { Button } from '@/components/ui/button';
import { getTTSVoices } from '@/lib/audio/constants';
import { voiceRowBlurb } from '@/lib/audio/voice-display';

// ─── Constants ───────────────────────────────────────────────
const MAX_PDF_SIZE_MB = 50;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────
export interface GenerationToolbarProps {
  language: 'zh-CN' | 'en-US';
  onLanguageChange: (lang: 'zh-CN' | 'en-US') => void;
  webSearch: boolean;
  onWebSearchChange: (v: boolean) => void;
  onSettingsOpen: (section?: SettingsSection) => void;
  // PDF
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  onPdfError: (error: string | null) => void;
}

// ─── Component ───────────────────────────────────────────────
export function GenerationToolbar({
  language,
  onLanguageChange,
  webSearch,
  onWebSearchChange,
  onSettingsOpen,
  pdfFile,
  onPdfFileChange,
  onPdfError,
}: GenerationToolbarProps) {
  const { t } = useI18n();
  const currentModelId = useSettingsStore((s) => s.modelId);
  const pdfProviderId = useSettingsStore((s) => s.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((s) => s.pdfProvidersConfig);
  const setPDFProvider = useSettingsStore((s) => s.setPDFProvider);
  const webSearchProviderId = useSettingsStore((s) => s.webSearchProviderId);
  const webSearchProvidersConfig = useSettingsStore((s) => s.webSearchProvidersConfig);
  const setWebSearchProvider = useSettingsStore((s) => s.setWebSearchProvider);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Check if the selected web search provider has a valid config (API key or server-configured)
  const webSearchProvider = WEB_SEARCH_PROVIDERS[webSearchProviderId];
  const webSearchConfig = webSearchProvidersConfig[webSearchProviderId];
  const webSearchAvailable = webSearchProvider
    ? !webSearchProvider.requiresApiKey ||
      !!webSearchConfig?.apiKey ||
      !!webSearchConfig?.isServerConfigured
    : false;

  // PDF handler
  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/pdf') return;
    if (file.size > MAX_PDF_SIZE_BYTES) {
      onPdfError(t('upload.fileTooLarge'));
      return;
    }
    onPdfError(null);
    onPdfFileChange(file);
  };

  // ─── Pill button helper ─────────────────────────────
  const pillCls =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap border';
  const pillMuted = `${pillCls} border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60`;
  const pillActive = `${pillCls} border-violet-200/60 dark:border-violet-700/50 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300`;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <SystemModelBadge modelId={currentModelId} />

      {/* ── Separator ── */}
      <div className="w-px h-4 bg-border/60 mx-1" />

      {/* ── PDF (parser + upload) combined Popover ── */}
      <Popover>
        <PopoverTrigger asChild>
          {pdfFile ? (
            <button className={pillActive}>
              <Paperclip className="size-3.5" />
              <span className="max-w-[100px] truncate">{pdfFile.name}</span>
              <span
                role="button"
                className="size-4 rounded-full inline-flex items-center justify-center hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onPdfFileChange(null);
                }}
              >
                <X className="size-2.5" />
              </span>
            </button>
          ) : (
            <button className={pillMuted}>
              <Paperclip className="size-3.5" />
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          {/* Parser selector */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              {t('toolbar.pdfParser')}
            </span>
            <Select value={pdfProviderId} onValueChange={(v) => setPDFProvider(v as PDFProviderId)}>
              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(PDF_PROVIDERS).map((provider) => {
                  const cfg = pdfProvidersConfig[provider.id];
                  const available =
                    !provider.requiresApiKey || !!cfg?.apiKey || !!cfg?.isServerConfigured;
                  return (
                    <SelectItem key={provider.id} value={provider.id} disabled={!available}>
                      <div className={cn('flex items-center gap-1.5', !available && 'opacity-50')}>
                        {provider.icon && (
                          <img src={provider.icon} alt={provider.name} className="w-3.5 h-3.5" />
                        )}
                        {provider.name}
                        {cfg?.isServerConfigured && (
                          <span className="text-[9px] px-1 py-0 rounded border text-muted-foreground">
                            {t('settings.serverConfigured')}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Upload area / file info */}
          <div className="px-3 pb-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
                e.target.value = '';
              }}
            />
            {pdfFile ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <FileText className="size-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onPdfFileChange(null)}
                  className="w-full text-xs text-destructive hover:underline text-left"
                >
                  {t('toolbar.removePdf')}
                </button>
              </div>
            ) : (
              <div
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer',
                  isDragging
                    ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                    : 'border-muted-foreground/20 hover:border-violet-300',
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              >
                <Paperclip className="size-5 text-muted-foreground/50 mb-1.5" />
                <p className="text-xs font-medium">{t('toolbar.pdfUpload')}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {t('upload.pdfSizeLimit')}
                </p>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* ── Web Search ── */}
      {webSearchAvailable ? (
        <Popover>
          <PopoverTrigger asChild>
            <button className={webSearch ? pillActive : pillMuted}>
              <Globe2 className={cn('size-3.5', webSearch && 'animate-pulse')} />
              {webSearch && (
                <span>{WEB_SEARCH_PROVIDERS[webSearchProviderId]?.name || 'Search'}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3 space-y-3">
            {/* Toggle */}
            <button
              onClick={() => onWebSearchChange(!webSearch)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all',
                webSearch
                  ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
                  : 'border-border hover:bg-muted/50',
              )}
            >
              <Globe2
                className={cn(
                  'size-4 shrink-0',
                  webSearch ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">
                  {webSearch ? t('toolbar.webSearchOn') : t('toolbar.webSearchOff')}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {t('toolbar.webSearchDesc')}
                </p>
              </div>
            </button>

            {/* Provider selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                {t('toolbar.webSearchProvider')}
              </span>
              <Select
                value={webSearchProviderId}
                onValueChange={(v) => setWebSearchProvider(v as WebSearchProviderId)}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(WEB_SEARCH_PROVIDERS).map((provider) => {
                    const cfg = webSearchProvidersConfig[provider.id];
                    const available =
                      !provider.requiresApiKey || !!cfg?.apiKey || !!cfg?.isServerConfigured;
                    return (
                      <SelectItem key={provider.id} value={provider.id} disabled={!available}>
                        <div
                          className={cn('flex items-center gap-1.5', !available && 'opacity-50')}
                        >
                          {provider.name}
                          {cfg?.isServerConfigured && (
                            <span className="text-[9px] px-1 py-0 rounded border text-muted-foreground">
                              {t('settings.serverConfigured')}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button className={cn(pillCls, 'text-muted-foreground/40 cursor-not-allowed')} disabled>
              <Globe2 className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('toolbar.webSearchNoProvider')}</TooltipContent>
        </Tooltip>
      )}

      {/* ── Language pill ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onLanguageChange(language === 'zh-CN' ? 'en-US' : 'zh-CN')}
            className={pillMuted}
          >
            <Globe className="size-3.5" />
            <span>{language === 'zh-CN' ? '中文' : 'EN'}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('toolbar.languageHint')}</TooltipContent>
      </Tooltip>

      {/* ── Separator ── */}
      <div className="w-px h-4 bg-border/60 mx-1" />

      {/* ── Media popover ── */}
      <MediaPopover onSettingsOpen={onSettingsOpen} />
    </div>
  );
}

function SystemModelBadge({ modelId }: { modelId: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium select-none whitespace-nowrap border',
            'border-violet-200/60 dark:border-violet-700/50 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
          )}
        >
          <img src="/logos/openai.svg" alt="OpenAI" className="size-3.5 rounded-sm" />
          <span className="font-mono">{modelId}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>系统统一使用 OpenAI 模型</TooltipContent>
    </Tooltip>
  );
}

/** Read-only model badge for pages that used to offer model selection. */
export function GenerationModelSelector({
  onSettingsOpen: _onSettingsOpen,
}: {
  onSettingsOpen: (section?: SettingsSection) => void;
}) {
  const currentModelId = useSettingsStore((s) => s.modelId);
  return <SystemModelBadge modelId={currentModelId} />;
}

/** 朗读音色：与设置 → 语音合成中的 TTS 音色一致，可快速切换 */
export function ComposerVoiceSelector({
  onSettingsOpen,
}: {
  onSettingsOpen: (section?: SettingsSection) => void;
}) {
  const { t, locale } = useI18n();
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const setTTSVoice = useSettingsStore((s) => s.setTTSVoice);
  const [open, setOpen] = useState(false);

  const voices = useMemo(() => getTTSVoices(ttsProviderId), [ttsProviderId]);
  const currentLabel = useMemo(() => {
    const v = voices.find((x) => x.id === ttsVoice);
    return v?.name ?? ttsVoice;
  }, [voices, ttsVoice]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex max-w-[min(100%,11rem)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs font-medium select-none',
                'border-emerald-200/70 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-100',
              )}
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <Volume2 className="size-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="min-w-0 truncate">{currentLabel}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t('toolbar.ttsHint')}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[min(100vw-1.5rem,22rem)] p-0 sm:w-[26rem]" align="start" sideOffset={6}>
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-foreground">{t('toolbar.ttsTitle')}</p>
          <p className="text-[11px] text-muted-foreground">{t('toolbar.ttsHint')}</p>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {voices.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t('toolbar.ttsVoiceListEmpty')}</p>
          ) : (
            voices.map((v) => {
              const blurb = voiceRowBlurb(v, t, locale);
              return (
                <button
                  key={v.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    v.id === ttsVoice
                      ? 'bg-primary/12 font-medium text-primary'
                      : 'text-foreground hover:bg-muted/80',
                  )}
                  onClick={() => {
                    setTTSVoice(v.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 shrink-0 font-medium">{v.name}</span>
                  {blurb ? (
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-right text-[11px] leading-snug text-muted-foreground line-clamp-3',
                        v.id === ttsVoice && 'text-primary/80',
                      )}
                    >
                      {blurb}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border/60 p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs text-muted-foreground"
            onClick={() => {
              setOpen(false);
              onSettingsOpen('tts');
            }}
          >
            {t('toolbar.advancedSettings')}…
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
