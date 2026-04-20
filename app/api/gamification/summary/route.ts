import { apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { getOptionalPrisma } from '@/lib/server/prisma-safe';
import {
  buildGamificationDisabledSummary,
  getGamificationSummary,
  logGamificationError,
} from '@/lib/server/gamification';

export async function GET() {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  const prisma = getOptionalPrisma();
  if (!prisma) {
    return apiSuccess({ ...buildGamificationDisabledSummary() });
  }

  try {
    const summary = await getGamificationSummary(prisma, auth.userId);
    return apiSuccess({ ...summary });
  } catch (error) {
    logGamificationError('Failed to load gamification summary', error);
    return apiSuccess({ ...buildGamificationDisabledSummary() });
  }
}
