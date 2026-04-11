import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireServerSession } from '@/lib/server/auth';
import { ensureUserForApi } from '@/lib/server/ensure-user';

export async function requireUserId() {
  const session = await requireServerSession();
  const userId = session?.user?.id?.trim();
  if (userId) {
    const resolvedUserId =
      (await ensureUserForApi({
        userId,
        email: session?.user?.email,
        name: session?.user?.name,
      })) || userId;
    return { userId: resolvedUserId } as const;
  }

  // Temporary compatibility path: allow existing client-side auth store userId.
  const h = await headers();
  const fallbackUserId = h.get('x-user-id')?.trim();
  if (fallbackUserId) {
    const resolvedUserId =
      (await ensureUserForApi({
        userId: fallbackUserId,
        email: h.get('x-user-email'),
        name: h.get('x-user-name'),
      })) || fallbackUserId;
    return { userId: resolvedUserId } as const;
  }

  return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
}
