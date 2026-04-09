import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireUserId } from '@/lib/server/api-auth';
import { consumeNotebookGenerationCredit } from '@/lib/server/credits';

const bodySchema = z.object({
  kind: z.enum(['notebook_generation']),
  notebookName: z.string().trim().optional(),
  courseId: z.string().trim().optional(),
  courseName: z.string().trim().optional(),
  source: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const auth = await requireUserId();
  if ('response' in auth) return auth.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (error) {
    return apiError('INVALID_REQUEST', 400, error instanceof Error ? error.message : '请求体无效');
  }

  try {
    if (body.kind === 'notebook_generation') {
      const balanceAfter = await consumeNotebookGenerationCredit({
        userId: auth.userId,
        notebookName: body.notebookName,
        courseId: body.courseId,
        courseName: body.courseName,
        source: body.source,
      });
      return apiSuccess({
        kind: body.kind,
        balanceAfter,
      });
    }

    return apiError('INVALID_REQUEST', 400, '不支持的额度类型');
  } catch (error) {
    return apiError(
      'INVALID_REQUEST',
      400,
      error instanceof Error ? error.message : '额度扣减失败',
    );
  }
}
