'use client';

import { createLogger } from '@/lib/logger';

const log = createLogger('PDFPageSelection');

export const PDF_PAGE_SELECTION_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
const THUMBNAIL_WIDTH = 320;
const FULL_SCREENSHOT_WIDTH = 1280;

export type PdfPageImageMode = 'direct' | 'screenshot';

export interface PdfPageSelectionPreview {
  pageNumber: number;
  thumbnailSrc: string;
  textPreview: string;
  hasImages: boolean;
  imageCount: number;
  textBytesEstimate: number;
  directBytesEstimate: number;
  screenshotBytesEstimate: number;
  recommendedImageMode: PdfPageImageMode;
}

export interface PdfPageSelectionItem {
  pageNumber: number;
  keep: boolean;
  hasImages: boolean;
  imageMode: PdfPageImageMode;
  estimatedBytes: number;
}

export interface PdfSourceSelection {
  type: 'pdf';
  fileSignature: string;
  maxContentBytes: number;
  pages: PdfPageSelectionItem[];
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function estimateDataUrlBytes(src: string): number {
  const base64 = src.split(',')[1] || '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function estimateScreenshotBytesFromThumbnail(thumbnailSrc: string): number {
  const thumbBytes = estimateDataUrlBytes(thumbnailSrc);
  const scaleFactor = FULL_SCREENSHOT_WIDTH / THUMBNAIL_WIDTH;
  return Math.round(thumbBytes * scaleFactor * scaleFactor);
}

function buildTextPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '本页没有可提取的正文。';
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 119).trimEnd()}…`;
}

export function getPdfSourceFileSignature(file: File): string {
  return [file.name, file.size, file.lastModified].join(':');
}

export function computePdfSourceSelectionEstimateBytes(selection: PdfSourceSelection): number {
  return selection.pages
    .filter((page) => page.keep)
    .reduce((sum, page) => sum + page.estimatedBytes, 0);
}

export function buildInitialPdfSourceSelection(args: {
  fileSignature: string;
  previews: PdfPageSelectionPreview[];
  maxContentBytes?: number;
}): PdfSourceSelection {
  const maxContentBytes = args.maxContentBytes ?? PDF_PAGE_SELECTION_MAX_BYTES;
  let running = 0;

  const pages = args.previews.map((preview) => {
    const estimatedBytes =
      preview.textBytesEstimate +
      (preview.hasImages
        ? preview.recommendedImageMode === 'direct'
          ? preview.directBytesEstimate
          : preview.screenshotBytesEstimate
        : 0);

    const keep = running + estimatedBytes <= maxContentBytes;
    if (keep) running += estimatedBytes;

    return {
      pageNumber: preview.pageNumber,
      keep,
      hasImages: preview.hasImages,
      imageMode: preview.recommendedImageMode,
      estimatedBytes,
    } satisfies PdfPageSelectionItem;
  });

  return {
    type: 'pdf',
    fileSignature: args.fileSignature,
    maxContentBytes,
    pages,
  };
}

export async function analyzePdfForSelection(args: {
  file: File;
  signal?: AbortSignal;
  onPage?: (page: PdfPageSelectionPreview, totalPages: number) => void;
}): Promise<{
  fileSignature: string;
  pages: PdfPageSelectionPreview[];
}> {
  if (typeof window === 'undefined') {
    throw new Error('PDF page analysis is only available in the browser.');
  }

  const fileSignature = getPdfSourceFileSignature(args.file);
  const [{ getDocumentProxy, extractText, extractImages, renderPageAsImage }, arrayBuffer] =
    await Promise.all([import('unpdf'), args.file.arrayBuffer()]);
  throwIfAborted(args.signal);

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [];
  const pages: PdfPageSelectionPreview[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    throwIfAborted(args.signal);

    const pageText = pageTexts[pageNumber - 1] || '';
    let thumbnailSrc = '';
    let extractedImages: Awaited<ReturnType<typeof extractImages>> = [];

    try {
      thumbnailSrc = await renderPageAsImage(pdf, pageNumber, {
        toDataURL: true,
        width: THUMBNAIL_WIDTH,
      });
    } catch (error) {
      log.warn('Failed to render thumbnail for PDF page selection', {
        pageNumber,
        fileName: args.file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      extractedImages = await extractImages(pdf, pageNumber);
    } catch (error) {
      log.warn('Failed to inspect images for PDF page selection', {
        pageNumber,
        fileName: args.file.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const directBytesEstimate = extractedImages.reduce((sum, image) => sum + image.data.byteLength, 0);
    const screenshotBytesEstimate = thumbnailSrc
      ? estimateScreenshotBytesFromThumbnail(thumbnailSrc)
      : directBytesEstimate;
    const preview: PdfPageSelectionPreview = {
      pageNumber,
      thumbnailSrc,
      textPreview: buildTextPreview(pageText),
      hasImages: extractedImages.length > 0,
      imageCount: extractedImages.length,
      textBytesEstimate: new TextEncoder().encode(pageText).length,
      directBytesEstimate,
      screenshotBytesEstimate,
      recommendedImageMode:
        extractedImages.length > 0 && screenshotBytesEstimate < directBytesEstimate
          ? 'screenshot'
          : 'direct',
    };
    pages.push(preview);
    args.onPage?.(preview, totalPages);
  }

  return { fileSignature, pages };
}
