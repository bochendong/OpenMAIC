import { Prisma } from '@prisma/client';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireServerSession } from '@/lib/server/auth';
import { ensureUserForApi } from '@/lib/server/ensure-user';
import { getOptionalPrisma, isDatabaseConfigured } from '@/lib/server/prisma-safe';

export interface AdminIdentity {
  userId: string;
  email?: string;
  name?: string;
}

function fallbackAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function fallbackAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isFallbackAdmin(identity: AdminIdentity): boolean {
  const email = identity.email?.trim().toLowerCase();
  const adminEmails = fallbackAdminEmails();
  const adminIds = fallbackAdminIds();
  return Boolean((email && adminEmails.includes(email)) || adminIds.includes(identity.userId));
}

async function resolveIdentity(): Promise<AdminIdentity | null> {
  const session = await requireServerSession();
  const sessionUserId = session?.user?.id?.trim();
  if (sessionUserId) {
    await ensureUserForApi(sessionUserId);
    return {
      userId: sessionUserId,
      email: session?.user?.email?.trim().toLowerCase() || undefined,
      name: session?.user?.name?.trim() || undefined,
    };
  }

  const h = await headers();
  const userId = h.get('x-user-id')?.trim();
  if (!userId) return null;

  await ensureUserForApi(userId);
  return {
    userId,
    email: h.get('x-user-email')?.trim().toLowerCase() || undefined,
    name: h.get('x-user-name')?.trim() || undefined,
  };
}

export async function requireAdmin() {
  const identity = await resolveIdentity();
  if (!identity) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }

  if (!isDatabaseConfigured()) {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json(
        { error: 'Admin access requires DATABASE_URL or ADMIN_EMAILS/ADMIN_USER_IDS.' },
        { status: 403 },
      ),
    } as const;
  }

  const prisma = getOptionalPrisma();
  if (!prisma) {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json({ error: 'Admin access is unavailable.' }, { status: 503 }),
    } as const;
  }

  let emailFromDb: string | null = null;
  let nameFromDb: string | null = null;
  let dbRole: string | null = null;
  try {
    const profile = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { email: true, name: true },
    });
    emailFromDb = profile?.email ?? null;
    nameFromDb = profile?.name ?? null;
  } catch {
    if (isFallbackAdmin(identity)) {
      return { identity } as const;
    }
    return {
      response: NextResponse.json({ error: 'Admin access is unavailable.' }, { status: 503 }),
    } as const;
  }

  try {
    // 与 findUnique 分开：数据库若尚未执行含 role 的迁移，此处失败则仅跳过 DB 角色判定。
    const roleRows = await prisma.$queryRaw<Array<{ role: string }>>(
      Prisma.sql`SELECT role::text AS "role" FROM "User" WHERE id = ${identity.userId} LIMIT 1`,
    );
    dbRole = roleRows[0]?.role ?? null;
  } catch {
    dbRole = null;
  }

  if (dbRole === 'ADMIN' || isFallbackAdmin(identity)) {
    return {
      identity: {
        ...identity,
        email: emailFromDb || identity.email,
        name: nameFromDb || identity.name,
      },
    } as const;
  }

  return {
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  } as const;
}

export async function requireResolvedUser() {
  const identity = await resolveIdentity();
  if (!identity) return null;
  return {
    id: identity.userId,
    email: identity.email,
    name: identity.name,
  };
}

