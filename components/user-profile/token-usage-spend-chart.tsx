'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { formatUsdLabel } from '@/lib/utils/credits';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

type SpendChartData = {
  periodLabel: string;
  startDate: string;
  endDate: string;
  dates: Array<{
    date: string;
    label: string;
  }>;
  series: Array<{
    modelString: string;
    estimatedCostUsd: number;
    estimatedCostCredits: number;
    cumulativeEstimatedCostUsd: number[];
    cumulativeEstimatedCostCredits: number[];
  }>;
  totalEstimatedCostUsd: number;
  totalEstimatedCostCredits: number;
};

const CHART_COLORS = [
  '#4D9B7D',
  '#8EA8D2',
  '#5E7EB6',
  '#B58BB2',
  '#A8C28A',
  '#E0BC77',
  '#D58E79',
  '#C17373',
  '#A7A7A7',
];

type TooltipSeriesRow = {
  axisValueLabel?: string;
  marker?: string;
  seriesName?: string;
  value?: number | string | null;
};

function formatCompactUsd(value: number) {
  return formatUsdLabel(value).replace('US$', '$');
}

export function TokenUsageSpendChart({ data }: { data: SpendChartData | null | undefined }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const option = useMemo<echarts.EChartsCoreOption | null>(() => {
    if (!data || data.series.length === 0 || data.dates.length === 0) {
      return null;
    }

    return {
      color: CHART_COLORS,
      animationDuration: 500,
      grid: {
        left: 14,
        right: 18,
        top: 64,
        bottom: 18,
        containLabel: true,
      },
      legend: {
        top: 8,
        left: 0,
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 8,
        textStyle: {
          color: '#6b7280',
          fontSize: 11,
        },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderWidth: 0,
        textStyle: {
          color: '#f8fafc',
          fontSize: 12,
        },
        formatter: (params: unknown) => {
          const rows = (Array.isArray(params) ? params : [params]).filter(
            (row): row is TooltipSeriesRow => Boolean(row) && typeof row === 'object',
          );
          if (rows.length === 0) return '';

          const dateLabel = rows[0].axisValueLabel;
          const sortedRows = [...rows].sort(
            (a, b) => Number(b.value ?? 0) - Number(a.value ?? 0),
          );
          const total = sortedRows.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
          const items = sortedRows
            .filter((row) => Number(row.value ?? 0) > 0)
            .map((row) => {
              const marker = row.marker || '';
              return `${marker} ${row.seriesName}: ${formatCompactUsd(Number(row.value ?? 0))}`;
            })
            .join('<br/>');

          return [
            `<div style="font-weight:600;margin-bottom:6px;">${dateLabel}</div>`,
            `<div style="margin-bottom:6px;">累计总花费: ${formatCompactUsd(total)}</div>`,
            items,
          ].join('');
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.dates.map((point) => point.label),
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(100, 116, 139, 0.28)',
          },
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Cumulative Spend',
        nameLocation: 'middle',
        nameGap: 54,
        nameTextStyle: {
          color: '#6b7280',
          fontSize: 12,
        },
        axisLabel: {
          color: '#6b7280',
          formatter: (value: number) => formatCompactUsd(value),
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(148, 163, 184, 0.16)',
          },
        },
      },
      series: data.series.map((series) => ({
        name: series.modelString,
        type: 'line',
        stack: 'spend',
        smooth: true,
        showSymbol: false,
        symbol: 'none',
        lineStyle: {
          width: 2.5,
        },
        areaStyle: {
          opacity: 0.26,
        },
        emphasis: {
          focus: 'series',
        },
        data: series.cumulativeEstimatedCostUsd,
      })),
    };
  }, [data]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, null, { renderer: 'svg' });
    chartInstanceRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartInstanceRef.current) return;
    if (!option) {
      chartInstanceRef.current.clear();
      return;
    }
    chartInstanceRef.current.setOption(option, true);
  }, [option]);

  if (!data || data.series.length === 0 || data.dates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-4 py-12 text-center text-xs text-muted-foreground">
        近 30 天暂无可绘制的累计 spend 数据。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Your Usage</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.periodLabel}按模型累计 spend，便于看出每种模型的真实花费走势
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">
            By Model
          </span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">
            Spend
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">周期</div>
          <div className="mt-1 text-sm font-medium text-foreground">{data.periodLabel}</div>
        </div>
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">累计花费</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {formatUsdLabel(data.totalEstimatedCostUsd)}
          </div>
        </div>
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">开始</div>
          <div className="mt-1 text-sm font-medium text-foreground">{data.startDate}</div>
        </div>
        <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-950/30">
          <div className="text-[11px] text-muted-foreground">结束</div>
          <div className="mt-1 text-sm font-medium text-foreground">{data.endDate}</div>
        </div>
      </div>
      <div ref={chartRef} className="mt-4 h-[360px] w-full" />
    </div>
  );
}
