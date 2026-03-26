import type { ContactConversationKind } from '@/lib/utils/database';
import { backendJson } from '@/lib/utils/backend-api';

const MAX_CONTACT_MESSAGES = 300;

type ConversationRow = {
  id: string;
  courseId: string | null;
  notebookId: string | null;
  kind: ContactConversationKind;
  targetId: string | null;
  title: string | null;
  meta: unknown;
};

type MessageRow = {
  id: string;
  role: string;
  content: unknown;
  createdAt: string;
};

async function ensureConversation(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
}): Promise<string> {
  const q = new URLSearchParams({
    kind: args.kind,
    targetId: args.targetId,
  });
  // notebook 会话按 targetId 复用，避免因 course 上下文变化创建重复会话
  if (args.kind !== 'notebook') {
    q.set('courseId', args.courseId);
  }
  const listed = await backendJson<{ conversations: ConversationRow[] }>(`/api/conversations?${q.toString()}`);
  if (listed.conversations.length > 0) {
    return listed.conversations[0].id;
  }

  const created = await backendJson<{ conversation: ConversationRow }>('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: args.courseId,
      notebookId: args.kind === 'notebook' ? args.targetId : undefined,
      kind: args.kind,
      targetId: args.targetId,
      title: args.targetName,
      meta: { targetName: args.targetName, storageMode: 'snapshot' },
    }),
  });
  return created.conversation.id;
}

export async function loadContactMessages<T>(
  courseId: string | null | undefined,
  kind: ContactConversationKind,
  targetId: string,
  options?: {
    /** 为 notebook 会话提供「仅按 targetId」读取能力，避免受当前课程上下文影响 */
    ignoreCourseId?: boolean;
  },
): Promise<T[]> {
  const q = new URLSearchParams({
    kind,
    targetId,
  });
  if (courseId?.trim() && !options?.ignoreCourseId) {
    q.set('courseId', courseId.trim());
  }
  const listed = await backendJson<{ conversations: ConversationRow[] }>(`/api/conversations?${q.toString()}`);
  const conversation = listed.conversations[0];
  if (!conversation) return [];

  const messages = await backendJson<{ messages: MessageRow[] }>(
    `/api/conversations/${encodeURIComponent(conversation.id)}/messages`,
  );
  const snapshots = messages.messages.filter((m) => m.role === 'snapshot');
  const latest = snapshots[snapshots.length - 1];
  if (!latest || !latest.content || typeof latest.content !== 'object') return [];
  const payload = latest.content as { messages?: unknown[] };
  return (payload.messages || []) as T[];
}

export async function saveContactMessages<T>(args: {
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
  messages: T[];
}): Promise<void> {
  const conversationId = await ensureConversation(args);
  await backendJson<{ message: MessageRow }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'snapshot',
        content: {
          messages: args.messages.slice(-MAX_CONTACT_MESSAGES),
        },
        meta: {
          targetName: args.targetName,
        },
      }),
    },
  );
}
