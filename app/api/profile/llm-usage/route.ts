import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';

type UsageSummary = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

type ModelBreakdownRow = {
  modelString: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageRecordRow = {
  id: string;
  route: string;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  createdAt: string;
};

function buildEmptySummary(): UsageSummary {
  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
  };
}

export async function GET() {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      summary: buildEmptySummary(),
      modelBreakdown: [] as ModelBreakdownRow[],
      usageRecords: [] as UsageRecordRow[],
    });
  }

  const userId = auth.userId;

  const [aggregate, usageRows] = await Promise.all([
    prisma.lLMUsageLog.aggregate({
      where: { userId },
      _count: { id: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    }),
    prisma.lLMUsageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        route: true,
        source: true,
        providerId: true,
        modelId: true,
        modelString: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        createdAt: true,
      },
    }),
  ]);

  const modelMap = new Map<string, ModelBreakdownRow>();

  for (const row of usageRows) {
    const modelRow = modelMap.get(row.modelString) ?? {
      modelString: row.modelString,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    modelRow.requestCount += 1;
    modelRow.inputTokens += row.inputTokens;
    modelRow.outputTokens += row.outputTokens;
    modelRow.totalTokens += row.totalTokens;
    modelMap.set(row.modelString, modelRow);
  }

  return apiSuccess({
    databaseEnabled: true,
    summary: {
      totalCalls: aggregate._count.id,
      totalInputTokens: aggregate._sum.inputTokens ?? 0,
      totalOutputTokens: aggregate._sum.outputTokens ?? 0,
      totalTokens: aggregate._sum.totalTokens ?? 0,
    },
    modelBreakdown: Array.from(modelMap.values()).sort((a, b) => {
      if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
      return b.requestCount - a.requestCount;
    }),
    usageRecords: usageRows.map((row): UsageRecordRow => ({
      id: row.id,
      route: row.route,
      source: row.source,
      providerId: row.providerId,
      modelId: row.modelId,
      modelString: row.modelString,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
