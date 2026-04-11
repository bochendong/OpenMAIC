'use client';

import { ScreenElement } from './ScreenElement';
import { HighlightOverlay } from './HighlightOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { getElementListRange, getElementRange } from '@/lib/utils/element';
import { applyAutoHeightReflow } from '@/lib/slide-layout-reflow';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { PercentageGeometry } from '@/lib/types/action';
import { useViewportSize } from './Canvas/hooks/useViewportSize';
import { useCallback, useMemo, useState, type RefObject } from 'react';
import { AnimatePresence } from 'motion/react';

export interface ScreenCanvasProps {
  /** Fills the slide stage; used for viewport measurement and clipping (no extra wrapper inside). */
  readonly containerRef: RefObject<HTMLDivElement | null>;
}

const CONTENT_BOTTOM_PADDING = 24;

function getPercentageGeometryForElement(
  element: PPTElement,
  viewportWidth: number,
  contentHeight: number,
): PercentageGeometry {
  const { minX, maxX, minY, maxY } = getElementRange(element);
  const width = maxX - minX;
  const height = maxY - minY;
  const x = (minX / viewportWidth) * 100;
  const y = (minY / contentHeight) * 100;
  const w = (width / viewportWidth) * 100;
  const h = (height / contentHeight) * 100;

  return {
    x,
    y,
    w,
    h,
    centerX: x + w / 2,
    centerY: y + h / 2,
  };
}

export function ScreenCanvas({ containerRef }: ScreenCanvasProps) {
  const canvasScale = useCanvasStore.use.canvasScale();
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );
  const [autoHeights, setAutoHeights] = useState<Record<string, number>>({});

  const handleElementAutoHeightChange = useCallback((elementId: string, nextHeight: number) => {
    setAutoHeights((prev) => {
      const current = prev[elementId];
      const normalized = Math.ceil(nextHeight);
      if (!Number.isFinite(normalized) || normalized <= 0) return prev;
      if (current !== undefined && Math.abs(current - normalized) <= 1) return prev;
      return {
        ...prev,
        [elementId]: normalized,
      };
    });
  }, []);

  const activeAutoHeights = useMemo(() => {
    if (Object.keys(autoHeights).length === 0) return autoHeights;
    const validIds = new Set(elements.map((element) => element.id));
    return Object.fromEntries(
      Object.entries(autoHeights).filter(([elementId]) => validIds.has(elementId)),
    );
  }, [autoHeights, elements]);

  const adjustedElements = useMemo(() => {
    if (!elements.length) return elements;
    return applyAutoHeightReflow({
      elements,
      requestedHeights: activeAutoHeights,
    });
  }, [activeAutoHeights, elements]);
  const reflowStats = useMemo(() => {
    if (!elements.length || elements.length !== adjustedElements.length) {
      return { adjustedCount: 0, maxHeightDelta: 0, maxTopDelta: 0 };
    }
    let adjustedCount = 0;
    let maxHeightDelta = 0;
    let maxTopDelta = 0;
    for (let i = 0; i < elements.length; i += 1) {
      const source = elements[i];
      const target = adjustedElements[i];
      let elementTopDelta = 0;
      let elementHeightDelta = 0;
      if (
        typeof (source as { top?: unknown }).top === 'number' &&
        typeof (target as { top?: unknown }).top === 'number'
      ) {
        elementTopDelta = Math.abs((target as { top: number }).top - (source as { top: number }).top);
        maxTopDelta = Math.max(maxTopDelta, elementTopDelta);
      }
      if (
        typeof (source as { height?: unknown }).height === 'number' &&
        typeof (target as { height?: unknown }).height === 'number'
      ) {
        elementHeightDelta = Math.abs(
          (target as { height: number }).height - (source as { height: number }).height,
        );
        maxHeightDelta = Math.max(maxHeightDelta, elementHeightDelta);
      }
      if (elementTopDelta > 0 || elementHeightDelta > 0) {
        adjustedCount += 1;
      }
    }
    return { adjustedCount, maxHeightDelta, maxTopDelta };
  }, [adjustedElements, elements]);

  // Viewport size and positioning
  const { viewportStyles } = useViewportSize(containerRef);

  // Get background style
  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );
  const { backgroundStyle } = useSlideBackgroundStyle(background);

  const contentHeight = useMemo(() => {
    if (!adjustedElements.length) return viewportStyles.height;
    const { maxY } = getElementListRange(adjustedElements);
    return Math.max(viewportStyles.height, maxY + CONTENT_BOTTOM_PADDING);
  }, [adjustedElements, viewportStyles.height]);
  const fitScale = useMemo(
    () => Math.min(1, viewportStyles.height / contentHeight),
    [contentHeight, viewportStyles.height],
  );
  const fittedCanvasScale = canvasScale * fitScale;
  const fittedCanvasWidth = viewportStyles.width * fittedCanvasScale;
  const fittedCanvasHeight = contentHeight * fittedCanvasScale;
  const fittedCanvasLeft =
    viewportStyles.left + (viewportStyles.width * canvasScale - fittedCanvasWidth) / 2;

  // Get visual effect state
  const laserElementId = useCanvasStore.use.laserElementId();
  const laserOptions = useCanvasStore.use.laserOptions();
  const zoomTarget = useCanvasStore.use.zoomTarget();

  // Compute laser pointer geometry
  const laserGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!laserElementId) return null;
    const element = adjustedElements.find((el) => el.id === laserElementId);
    if (!element) return null;
    return getPercentageGeometryForElement(element, viewportStyles.width, contentHeight);
  }, [adjustedElements, contentHeight, laserElementId, viewportStyles.width]);

  // Compute zoom target geometry
  const zoomGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!zoomTarget) return null;
    const element = adjustedElements.find((el) => el.id === zoomTarget.elementId);
    if (!element) return null;
    return getPercentageGeometryForElement(element, viewportStyles.width, contentHeight);
  }, [adjustedElements, contentHeight, viewportStyles.width, zoomTarget]);

  return (
    <div
      className="absolute overflow-hidden transition-transform duration-700"
      style={{
        width: `${fittedCanvasWidth}px`,
        height: `${fittedCanvasHeight}px`,
        left: `${fittedCanvasLeft}px`,
        top: `${viewportStyles.top}px`,
        ...(zoomTarget && zoomGeometry
          ? {
              transform: `scale(${zoomTarget.scale})`,
              transformOrigin: `${zoomGeometry.centerX}% ${zoomGeometry.centerY}%`,
            }
          : {}),
      }}
    >
      {/* Background layer — chrome (shadow / 20px radius) lives on canvas-area parent */}
      <div className="h-full w-full bg-position-center" style={{ ...backgroundStyle }} />

      {/* Content layer - logical slide size, scaled to viewport */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        data-reflow-adjusted-count={reflowStats.adjustedCount}
        data-reflow-max-height-delta={reflowStats.maxHeightDelta}
        data-reflow-max-top-delta={reflowStats.maxTopDelta}
        style={{
          width: `${viewportStyles.width}px`,
          height: `${contentHeight}px`,
          transform: `scale(${fittedCanvasScale})`,
        }}
      >
        {adjustedElements.map((element, index) => (
          <ScreenElement
            key={element.id}
            elementInfo={element}
            elementIndex={index + 1}
            onElementAutoHeightChange={handleElementAutoHeightChange}
          />
        ))}

        <HighlightOverlay />
      </div>

      <SpotlightOverlay />

      <div className="pointer-events-none absolute inset-0" style={{ padding: '5%' }}>
        <div className="relative h-full w-full">
          <AnimatePresence>
            {laserElementId && laserGeometry && (
              <LaserOverlay
                key={`laser-${laserElementId}`}
                geometry={laserGeometry}
                color={laserOptions?.color}
                duration={laserOptions?.duration}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
