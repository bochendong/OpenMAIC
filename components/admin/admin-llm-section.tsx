'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shield, KeyRound, Bot, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { backendJson } from '@/lib/utils/backend-api';

const OPENAI_SYSTEM_MODEL_GROUPS: { label: string; options: { id: string; title: string }[] }[] = [
  {
    label: 'GPT-5 系列',
    options: [
      { id: 'gpt-5.4', title: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', title: 'GPT-5.4 mini' },
    ],
  },
  {
    label: 'GPT-4 系列',
    options: [
      { id: 'gpt-4o', title: 'GPT-4o' },
      { id: 'gpt-4o-mini', title: 'GPT-4o mini（默认）' },
    ],
  },
];

const OPENAI_PRESET_MODEL_IDS = new Set(
  OPENAI_SYSTEM_MODEL_GROUPS.flatMap((g) => g.options.map((o) => o.id)),
);

const OPENAI_CUSTOM_MODEL_VALUE = '__custom__';

type LLMConfigResponse = {
  config: {
    providerId: string;
    modelId: string;
    baseUrl: string | null;
    hasApiKey: boolean;
    maskedApiKey: string | null;
    source: 'database' | 'environment';
    updatedAt: string | null;
  };
};

type LLMUsageResponse = {
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  rows: Array<{
    id: string;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
    route: string;
    modelString: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    createdAt: string;
  }>;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function AdminLLMSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<LLMConfigResponse['config'] | null>(null);
  const [usage, setUsage] = useState<LLMUsageResponse | null>(null);
  const [form, setForm] = useState({
    modelId: 'gpt-4o-mini',
    baseUrl: '',
    apiKey: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    setUsageError(null);
    try {
      const configResp = await backendJson<LLMConfigResponse>('/api/admin/llm-config');
      setConfig(configResp.config);
      setForm({
        modelId: configResp.config.modelId || 'gpt-4o-mini',
        baseUrl: configResp.config.baseUrl || '',
        apiKey: '',
      });

      try {
        const usageResp = await backendJson<LLMUsageResponse>('/api/admin/llm-usage');
        setUsage(usageResp);
      } catch (usageLoadError) {
        setUsage(null);
        setUsageError(
          usageLoadError instanceof Error ? usageLoadError.message : String(usageLoadError),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const canSubmit = useMemo(() => form.modelId.trim().length > 0, [form.modelId]);

  const modelSelectValue = useMemo(() => {
    const id = form.modelId.trim();
    return OPENAI_PRESET_MODEL_IDS.has(id) ? id : OPENAI_CUSTOM_MODEL_VALUE;
  }, [form.modelId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        modelId: form.modelId.trim(),
        baseUrl: form.baseUrl.trim() || null,
        apiKey: form.apiKey.trim() || undefined,
      };
      const resp = await backendJson<LLMConfigResponse>('/api/admin/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setConfig(resp.config);
      setForm((prev) => ({ ...prev, apiKey: '' }));
      setSuccess(
        form.apiKey.trim()
          ? '系统 OpenAI 配置已更新。'
          : '已保存；未填写新 API Key，已沿用数据库中的密钥（掩码可能不变）。',
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载语言模型配置…</p>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {usageError ? (
        <Alert>
          <AlertTitle>用量数据暂不可用</AlertTitle>
          <AlertDescription>{usageError}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <AlertTitle>保存成功</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              系统模型配置
            </CardTitle>
            <CardDescription>全站用户统一使用这里配置的 OpenAI key 与固定模型。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="text-xs text-muted-foreground">提供方</div>
                <div className="mt-1 font-medium">OpenAI</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="text-xs text-muted-foreground">当前模型</div>
                <div className="mt-1 font-medium">{config?.modelId || '-'}</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="text-xs text-muted-foreground">当前来源</div>
                <div className="mt-1 font-medium">
                  {config?.source === 'database' ? '管理员配置' : '环境变量回退'}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="text-xs text-muted-foreground">当前 Base URL</div>
                <div className="mt-1 break-all font-medium">{config?.baseUrl || 'OpenAI 默认地址'}</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="text-xs text-muted-foreground">当前 API Key</div>
                <div className="mt-1 font-medium">{config?.maskedApiKey || '未配置'}</div>
                {config?.updatedAt ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    配置更新时间：{new Date(config.updatedAt).toLocaleString('zh-CN')}
                  </div>
                ) : null}
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="model-select">
                  <Bot className="h-4 w-4" />
                  固定模型
                </Label>
                <Select
                  value={modelSelectValue}
                  onValueChange={(v) => {
                    if (v === OPENAI_CUSTOM_MODEL_VALUE) {
                      setForm((prev) => ({ ...prev, modelId: prev.modelId.trim() }));
                    } else {
                      setForm((prev) => ({ ...prev, modelId: v }));
                    }
                  }}
                >
                  <SelectTrigger id="model-select" className="w-full min-w-0">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72 min-w-[var(--radix-select-trigger-width)]">
                    {OPENAI_SYSTEM_MODEL_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    <SelectItem value={OPENAI_CUSTOM_MODEL_VALUE}>自定义…</SelectItem>
                  </SelectContent>
                </Select>
                {modelSelectValue === OPENAI_CUSTOM_MODEL_VALUE ? (
                  <Input
                    id="model-id"
                    value={form.modelId}
                    onChange={(e) => setForm((prev) => ({ ...prev, modelId: e.target.value }))}
                    placeholder="例如 gpt-5.4-2026-03-05"
                    className="font-mono text-sm"
                    autoComplete="off"
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  列表为常用 ID；完整名称以 OpenAI 账号可用模型为准。未开通的模型保存后调用会失败。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base-url">Base URL（可选）</Label>
                <Input
                  id="base-url"
                  value={form.baseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">
                  <KeyRound className="h-4 w-4" />
                  OpenAI API Key
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="留空则保持当前 key 不变"
                />
              </div>

              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? '保存中…' : '保存系统配置'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              用量汇总
            </CardTitle>
            <CardDescription>Token 数据可用于后续按用户计费。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">调用次数</div>
              <div className="mt-1 text-xl font-semibold">
                {formatNumber(usage?.summary.totalCalls || 0)}
              </div>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">输入 Tokens</div>
              <div className="mt-1 text-xl font-semibold">
                {formatNumber(usage?.summary.totalInputTokens || 0)}
              </div>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">输出 Tokens</div>
              <div className="mt-1 text-xl font-semibold">
                {formatNumber(usage?.summary.totalOutputTokens || 0)}
              </div>
            </div>
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">总 Tokens</div>
              <div className="mt-1 text-xl font-semibold">
                {formatNumber(usage?.summary.totalTokens || 0)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近用量明细</CardTitle>
          <CardDescription>按最近调用时间倒序。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">用户</th>
                  <th className="px-3 py-2 font-medium">路由</th>
                  <th className="px-3 py-2 font-medium">模型</th>
                  <th className="px-3 py-2 font-medium">输入</th>
                  <th className="px-3 py-2 font-medium">输出</th>
                  <th className="px-3 py-2 font-medium">总计</th>
                </tr>
              </thead>
              <tbody>
                {(usage?.rows || []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.userName || row.userEmail || row.userId || '匿名'}</div>
                      <div className="text-xs text-muted-foreground">{row.userEmail || row.userId || '-'}</div>
                    </td>
                    <td className="px-3 py-2">{row.route}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.modelString}</td>
                    <td className="px-3 py-2">{formatNumber(row.inputTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(row.outputTokens)}</td>
                    <td className="px-3 py-2 font-medium">{formatNumber(row.totalTokens)}</td>
                  </tr>
                ))}
                {(usage?.rows.length || 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                      暂无用量数据。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
