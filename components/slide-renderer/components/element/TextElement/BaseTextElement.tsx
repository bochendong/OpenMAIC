'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { PPTTextElement } from '@/lib/types/slides';
import { renderHtmlWithLatex } from '@/lib/render-html-with-latex';
import { useElementShadow } from '../hooks/useElementShadow';
import { ElementOutline } from '../ElementOutline';
import { TEXT_BOX_PADDING_PX } from '@/lib/slide-text-layout';

export interface BaseTextElementProps {
  elementInfo: PPTTextElement;
  target?: string;
  onAutoHeightChange?: (nextHeight: number) => void;
}

/**
 * Base text element component (read-only)
 * Renders static text content with styling
 */
export function BaseTextElement({ elementInfo, target, onAutoHeightChange }: BaseTextElementProps) {
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const proseRef = useRef<HTMLDivElement>(null);
  const renderedContent = useMemo(
    () => renderHtmlWithLatex(elementInfo.content),
    [elementInfo.content],
  );

  useEffect(() => {
    if (!onAutoHeightChange) return;
    const prose = proseRef.current;
    if (!prose) return;

    let rafId = 0;
    const measure = () => {
      const requiredInnerHeight = Math.ceil(prose.scrollHeight);
      if (requiredInnerHeight <= 0) return;
      const requiredHeight = requiredInnerHeight + TEXT_BOX_PADDING_PX * 2;
      if (requiredHeight > elementInfo.height + 1) {
        onAutoHeightChange(requiredHeight);
      }
    };
    const queueMeasure = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    queueMeasure();
    const resizeObserver = new ResizeObserver(queueMeasure);
    resizeObserver.observe(prose);
    const mutationObserver = new MutationObserver(queueMeasure);
    mutationObserver.observe(prose, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [elementInfo.content, elementInfo.height, onAutoHeightChange]);

  return (
    <div
      className="base-element-text absolute"
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div
        className="rotate-wrapper w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate}deg)` }}
      >
        <div
          className="element-content subpixel-antialiased relative leading-[1.5] break-words overflow-hidden"
          style={{
            width: `${elementInfo.width}px`,
            height: `${elementInfo.height}px`,
            backgroundColor: elementInfo.fill,
            opacity: elementInfo.opacity,
            textShadow: shadowStyle,
            lineHeight: elementInfo.lineHeight,
            letterSpacing: `${elementInfo.wordSpace || 0}px`,
            color: elementInfo.defaultColor,
            fontFamily: elementInfo.defaultFontName,
            writingMode: elementInfo.vertical ? 'vertical-rl' : 'horizontal-tb',
            // @ts-expect-error - CSS custom property
            '--paragraphSpace': `${elementInfo.paragraphSpace === undefined ? 5 : elementInfo.paragraphSpace}px`,
          }}
        >
          <ElementOutline
            width={elementInfo.width}
            height={elementInfo.height}
            outline={elementInfo.outline}
          />

          <div
            className="absolute overflow-hidden"
            style={{
              inset: `${TEXT_BOX_PADDING_PX}px`,
            }}
          >
            <div
              ref={proseRef}
              className={`text ProseMirror-static relative origin-top-left [&_ol]:my-0 [&_p]:m-0 [&_p:not(:last-child)]:mb-[var(--paragraphSpace)] [&_ul]:my-0 ${
                target === 'thumbnail' ? 'pointer-events-none' : ''
              }`}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
