import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import { DEFAULT_USER_CREDITS } from '@/lib/utils/credits';
import { ensureUserCreditsInitialized } from '@/lib/server/credits';

export async function GET() {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({
      databaseEnabled: false,
      balance: DEFAULT_USER_CREDITS,
      recentTransactions: [],
    });
  }

  await ensureUserCreditsInitialized(prisma, auth.userId);

  const [user, recentTransactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: { creditsBalance: true },
    }),
    prisma.creditTransaction.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        kind: true,
        delta: true,
        balanceAfter: true,
        description: true,
        createdAt: true,
      },
    }),
  ]);

  return apiSuccess({
    databaseEnabled: true,
    balance: user?.creditsBalance ?? DEFAULT_USER_CREDITS,
    recentTransactions: recentTransactions.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
