'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coins, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { backendJson } from '@/lib/utils/backend-api';

type CreditsResponse = {
  success: true;
  databaseEnabled: boolean;
  balance: number;
  recentTransactions: Array<{
    id: string;
    kind: string;
    delta: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
};

function formatDateTime(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CreditsCard() {
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCredits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await backendJson<CreditsResponse>('/api/profile/credits');
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  return (
    <Card className="p-5 !gap-0 shadow-xl border-muted/40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Credits 余额</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">新账户默认 500 credits，购买和 token 使用都会消耗余额。</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void loadCredits()}
          disabled={loading}
          className="h-8 gap-1.5 text-xs"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          刷新
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {error ? (
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            {error}
          </div>
        ) : null}

        {!data?.databaseEnabled ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-background/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            当前环境未配置数据库，credits 余额无法持久记录，下面显示的是默认值。
          </div>
        ) : null}

        <div className="rounded-2xl border bg-background/60 p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Coins className="size-4" />
            当前可用
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
            {data?.balance ?? 0}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">credits</div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">最近积分流水</p>
            <p className="text-xs text-muted-foreground">查看最近的扣费、收益和欢迎赠送记录。</p>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">变动</th>
                  <th className="px-3 py-2 font-medium">余额</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentTransactions ?? []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{row.description || row.kind}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.kind}</div>
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-medium ${row.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {row.delta >= 0 ? `+${row.delta}` : row.delta}
                    </td>
                    <td className="px-3 py-2">{row.balanceAfter}</td>
                  </tr>
                ))}
                {(data?.recentTransactions.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                      暂无积分流水
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}
