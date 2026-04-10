'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { computeOverflowFitMetrics, type OverflowFitMetrics } from '@/lib/slide-text-layout';

const DEFAULT_METRICS: OverflowFitMetrics = {
  scale: 1,
  viewportWidth: 0,
  viewportHeight: 0,
  contentWidth: 0,
  contentHeight: 0,
  isOverflowing: false,
};

export function useOverflowFit(enabled: boolean, deps: readonly unknown[] = []) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<OverflowFitMetrics>(DEFAULT_METRICS);

  const measure = useCallback(() => {
    if (!enabled) {
      setMetrics(DEFAULT_METRICS);
      return;
    }

    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const nextMetrics = computeOverflowFitMetrics({
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      contentWidth: Math.max(content.scrollWidth, content.offsetWidth),
      contentHeight: Math.max(content.scrollHeight, content.offsetHeight),
    });

    setMetrics((current) => {
      const sameScale = Math.abs(current.scale - nextMetrics.scale) < 0.001;
      const sameViewport =
        current.viewportWidth === nextMetrics.viewportWidth &&
        current.viewportHeight === nextMetrics.viewportHeight;
      const sameContent =
        current.contentWidth === nextMetrics.contentWidth &&
        current.contentHeight === nextMetrics.contentHeight;
      if (sameScale && sameViewport && sameContent) return current;
      return nextMetrics;
    });
  }, [enabled]);

  const measureKey = JSON.stringify(deps);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!enabled) {
        setMetrics(DEFAULT_METRICS);
        return;
      }
      measure();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [enabled, measure, measureKey]);

  useLayoutEffect(() => {
    if (!enabled) return;

    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [enabled, measure]);

  return {
    viewportRef,
    contentRef,
    metrics,
  };
}
