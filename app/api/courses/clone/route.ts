import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { requireUserId } from '@/lib/server/api-auth';
import { safeRoute } from '@/lib/server/json-error-response';
import { pickRandomCourseAvatarUrl } from '@/lib/constants/course-avatars';

const bodySchema = z.object({
  sourceCourseId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  return safeRoute(async () => {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const source = await prisma.course.findFirst({
      where: {
        id: parsed.data.sourceCourseId,
        listedInCourseStore: true,
        ownerId: { not: userId },
      },
    });

    if (!source) {
      return NextResponse.json({ error: '课程不存在或未在商城公开' }, { status: 404 });
    }

    const avatarUrl = source.avatarUrl?.trim() || pickRandomCourseAvatarUrl();

    const course = await prisma.course.create({
      data: {
        ownerId: userId,
        name: source.name,
        description: source.description ?? undefined,
        language: source.language,
        tags: source.tags,
        purpose: source.purpose,
        university: source.university ?? undefined,
        courseCode: source.courseCode ?? undefined,
        avatarUrl,
        listedInCourseStore: false,
      },
    });

    return NextResponse.json({ course }, { status: 201 });
  });
}
