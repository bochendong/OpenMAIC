'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Gift, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { backendJson } from '@/lib/utils/backend-api';

type CreditUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  creditsBalance: number;
  createdAt: string;
};

type SearchResponse = {
  success: true;
  users: CreditUserRow[];
};

type GrantResponse = {
  success: true;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    balance: number;
  };
  granted: number;
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

export function AdminCreditsSection() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CreditUserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amount, setAmount] = useState('500');
  const [note, setNote] = useState('');

  const selectedUser = useMemo(
    () => results.find((item) => item.id === selectedUserId) ?? null,
    [results, selectedUserId],
  );

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setSelectedUserId('');
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void backendJson<SearchResponse>(`/api/admin/credits?query=${encodeURIComponent(normalized)}`)
        .then((response) => {
          if (cancelled) return;
          setResults(response.users);
          setSelectedUserId((current) =>
            response.users.some((item) => item.id === current) ? current : (response.users[0]?.id ?? ''),
          );
        })
        .catch((loadError) => {
          if (cancelled) return;
          setResults([]);
          setSelectedUserId('');
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handleGrant = async () => {
    const parsedAmount = Number.parseInt(amount, 10);
    if (!selectedUserId) {
      toast.error('先搜索并选择一个用户');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('请输入大于 0 的积分数');
      return;
    }

    setSubmitting(true);
    try {
      const response = await backendJson<GrantResponse>('/api/admin/credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          amount: parsedAmount,
          note,
        }),
      });

      setResults((current) =>
        current.map((item) =>
          item.id === response.user.id
            ? { ...item, creditsBalance: response.user.balance }
            : item,
        ),
      );
      toast.success(`已为 ${response.user.email || response.user.name || '该用户'} 充值 ${response.granted} credits`);
      setNote('');
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            用户积分管理
          </CardTitle>
          <CardDescription>按邮箱搜索用户，然后直接为对方补发或充值 credits。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <Label htmlFor="credit-user-search">搜索邮箱</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="credit-user-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入完整邮箱或一部分，比如 alice@"
                  className="pl-9"
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>搜索失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="rounded-xl border">
                <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {loading
                    ? '搜索中…'
                    : query.trim()
                      ? `找到 ${results.length} 个匹配用户`
                      : '输入邮箱后开始搜索'}
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {results.length > 0 ? (
                    <div className="divide-y">
                      {results.map((user) => {
                        const active = user.id === selectedUserId;
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setSelectedUserId(user.id)}
                            className={`flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors ${
                              active ? 'bg-primary/8' : 'hover:bg-muted/40'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-medium text-foreground">
                                {user.email || '无邮箱'}
                              </span>
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                {user.creditsBalance} credits
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.name?.trim() || '未设置昵称'} · 注册于 {formatDateTime(user.createdAt)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {query.trim() ? '没有搜到匹配用户' : '等待输入邮箱'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border bg-background/60 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">发放积分</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  这会直接增加用户余额，并写入积分流水。
                </p>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <div className="text-xs text-muted-foreground">当前选中</div>
                <div className="mt-1 font-medium text-foreground">
                  {selectedUser?.email || '未选择用户'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedUser
                    ? `${selectedUser.name?.trim() || '未设置昵称'} · 当前余额 ${selectedUser.creditsBalance} credits`
                    : '先在左侧搜索并点选一个用户'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-amount">充值积分</Label>
                <Input
                  id="credit-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="例如 500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-note">备注</Label>
                <Textarea
                  id="credit-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="可选，比如 补偿活动、人工赠送、客服处理"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[100, 500, 1000, 3000].map((preset) => (
                  <Button key={preset} type="button" variant="outline" size="sm" onClick={() => setAmount(String(preset))}>
                    +{preset}
                  </Button>
                ))}
              </div>

              <Button type="button" onClick={() => void handleGrant()} disabled={!selectedUserId || submitting}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Gift className="mr-2 size-4" />}
                发放积分
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
