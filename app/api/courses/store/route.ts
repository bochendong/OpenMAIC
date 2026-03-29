import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';

function ownerDisplayName(owner: { name: string | null; email: string | null }): string {
  const n = owner.name?.trim();
  if (n) return n;
  const e = owner.email?.trim();
  if (e) {
    const local = e.split('@')[0]?.trim();
    return local || e;
  }
  return '用户';
}

export async function GET() {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const rows = await prisma.course.findMany({
      where: {
        listedInCourseStore: true,
        ownerId: { not: userId },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { notebooks: true } },
      },
    });

    const courses = rows.map((row) => {
      const { owner, _count, ...course } = row;
      return {
        ...course,
        ownerName: ownerDisplayName(owner),
        notebookCount: _count.notebooks,
      };
    });

    return NextResponse.json({ courses });
  });
}
