import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { UIMessage } from 'ai';
import {
  applyNotebookPlan,
  planNotebookMessage,
} from '@/lib/notebook/send-message';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { storeChatAttachmentBlob } from '@/lib/utils/chat-attachment-blobs';
import { loadContactMessages, saveContactMessages } from '@/lib/utils/contact-chat-storage';
import { createAgentTask, updateAgentTask } from '@/lib/utils/agent-task-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import {
  commitNotebookProblemImport,
  previewNotebookProblemImport,
} from '@/lib/utils/notebook-problem-api';
import {
  ATTACHMENT_ONLY_PLACEHOLDER,
  buildProblemBankImportPayload,
  shouldImportIntoProblemBank,
  stripProblemBankImportCommand,
} from './chat-attachment-utils';
import {
  appendNotebookAnswerCallout,
  buildChatMessage,
  formatAppliedSummary,
  hasNotebookWrites,
  shouldOfferMicroLessonButton,
} from './chat-message-utils';
import { NOTEBOOK_CHAT_PREVIEW_EVENT } from './chat-notebook-routing';
import type {
  NotebookAttachmentInput,
  NotebookChatMessage,
  NotebookSubtaskResult,
} from './chat-page-types';

export function useNotebookChatActions({
  courseId,
  notebookId,
  draft,
  pendingAttachments,
  sending,
  nbThread,
  selectedNotebookId,
  applyNotebookWrites,
  notebookWritesDisabledHint,
  reloadNotebookScenes,
  setNbThread,
  setDraft,
  setSending,
  setNotebookPendingAction,
  setPendingAttachments,
}: {
  courseId: string | null | undefined;
  notebookId: string | null;
  draft: string;
  pendingAttachments: NotebookAttachmentInput[];
  sending: boolean;
  nbThread: NotebookChatMessage[];
  selectedNotebookId: string | null;
  applyNotebookWrites: boolean;
  notebookWritesDisabledHint: string;
  reloadNotebookScenes: () => Promise<void>;
  setNbThread: Dispatch<SetStateAction<NotebookChatMessage[]>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setNotebookPendingAction: Dispatch<SetStateAction<'chat' | 'import' | null>>;
  setPendingAttachments: Dispatch<SetStateAction<NotebookAttachmentInput[]>>;
}) {
  const persistNotebookConversation = useCallback(
    async (
      notebook: StageListItem,
      question: string,
      assistant: Omit<Extract<NotebookChatMessage, { role: 'assistant' }>, 'role' | 'at'>,
    ) => {
      if (!courseId) return;
      try {
        const existing = await loadContactMessages<NotebookChatMessage>(
          courseId,
          'notebook',
          notebook.id,
        );
        const next: NotebookChatMessage[] = [
          ...existing,
          { role: 'user', text: question, at: Date.now() },
          { role: 'assistant', at: Date.now(), ...assistant },
        ];
        await saveContactMessages<NotebookChatMessage>({
          courseId,
          kind: 'notebook',
          targetId: notebook.id,
          targetName: notebook.name,
          messages: next,
        });
        window.dispatchEvent(
          new CustomEvent(NOTEBOOK_CHAT_PREVIEW_EVENT, {
            detail: { courseId, notebookId: notebook.id },
          }),
        );
      } catch {
        /* ignore notebook sync errors for orchestrator delegation */
      }
    },
    [courseId],
  );

  const runNotebookSubtask = useCallback(
    async (
      notebook: StageListItem,
      question: string,
      parentTaskId: string | null,
      appendAgentMessage?: (message: UIMessage<ChatMessageMetadata>) => void,
      attachments?: NotebookAttachmentInput[],
    ): Promise<NotebookSubtaskResult> => {
      const childTaskId =
        courseId && parentTaskId
          ? await createAgentTask({
              courseId,
              parentTaskId,
              contactKind: 'notebook',
              contactId: notebook.id,
              title: `子任务：${notebook.name}`,
              detail: '正在查看现有内容并判断是否需要补充 slides…',
              status: 'running',
            })
          : null;

      try {
        const plan = await planNotebookMessage(notebook.id, question, {
          allowWrite: true,
          preferWebSearch: true,
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
        });
        const shouldGenerateSlides = hasNotebookWrites(plan);
        let appliedLabel: string | undefined;

        if (shouldGenerateSlides) {
          appendAgentMessage?.(
            buildChatMessage(
              `我发现《${notebook.name}》里还缺少这部分知识点，已开始生成补充 slides。`,
              {
                senderName: notebook.name,
                senderAvatar: notebook.avatarUrl,
              },
            ),
          );
          if (childTaskId) {
            await updateAgentTask(childTaskId, {
              detail: '发现知识缺口，正在生成补充 slides…',
              status: 'running',
            });
          }
          const applied = await applyNotebookPlan(notebook.id, plan);
          appliedLabel = formatAppliedSummary({ applied }) || undefined;
          if (selectedNotebookId === notebook.id) {
            void reloadNotebookScenes();
          }
        }

        const answer = shouldGenerateSlides
          ? `${plan.answer}\n\n${appliedLabel ? `已补充内容：${appliedLabel}。` : '已补充相关 slides。'}现在可以开始听讲/查看新增内容了。`
          : plan.answer;
        const answerDocument = shouldGenerateSlides
          ? appendNotebookAnswerCallout({
              document: plan.answerDocument,
              fallbackText: answer,
              tone: 'success',
              title: '已补充内容',
              text: appliedLabel
                ? `${appliedLabel}。现在可以开始听讲或查看新增内容了。`
                : '已补充相关 slides，现在可以开始听讲或查看新增内容了。',
            })
          : plan.answerDocument;

        const assistantPayload: Omit<
          Extract<NotebookChatMessage, { role: 'assistant' }>,
          'role' | 'at'
        > = {
          answer,
          answerDocument,
          references: plan.references || [],
          knowledgeGap: plan.knowledgeGap,
          prerequisiteHints: plan.prerequisiteHints,
          webSearchUsed: plan.webSearchUsed,
          appliedLabel,
        };
        await persistNotebookConversation(notebook, question, assistantPayload);

        if (childTaskId) {
          await updateAgentTask(childTaskId, {
            detail: shouldGenerateSlides
              ? `已完成并补充内容：${appliedLabel || '新增 slides'}`
              : '已完成现有内容解答',
            status: 'done',
          });
        }

        return {
          notebook,
          answer,
          appliedLabel,
          knowledgeGap: plan.knowledgeGap,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (childTaskId) {
          await updateAgentTask(childTaskId, {
            detail: message.slice(0, 300),
            status: 'failed',
          });
        }
        appendAgentMessage?.(
          buildChatMessage(`《${notebook.name}》处理失败：${message}`, {
            senderName: notebook.name,
            senderAvatar: notebook.avatarUrl,
          }),
        );
        throw error;
      }
    },
    [courseId, persistNotebookConversation, reloadNotebookScenes, selectedNotebookId],
  );

  const handleImportNotebookProblemBank = useCallback(
    async (options?: { composerText?: string; commandTriggered?: boolean }) => {
      const currentDraft = options?.composerText ?? draft.trim();
      const importText = options?.commandTriggered
        ? stripProblemBankImportCommand(currentDraft)
        : currentDraft;
      const attachmentsSnapshot = [...pendingAttachments];
      const userFacingText =
        currentDraft || attachmentsSnapshot.length > 0
          ? options?.commandTriggered
            ? currentDraft || '导入到题库'
            : currentDraft
              ? `导入到题库\n\n${currentDraft}`
              : '导入到题库'
          : '';

      if ((!importText && attachmentsSnapshot.length === 0) || !notebookId || sending) return;
      const mc = getCurrentModelConfig();
      if (!mc.isServerConfigured) {
        window.alert('系统模型尚未配置，请联系管理员。');
        return;
      }

      try {
        await Promise.all(
          attachmentsSnapshot
            .filter((attachment): attachment is typeof attachment & { file: File } =>
              Boolean(attachment.file),
            )
            .map((attachment) => storeChatAttachmentBlob(attachment.id, attachment.file)),
        );
      } catch {
        /* IndexedDB 不可用时仍可导入，仅无法在刷新后再次打开附件 */
      }

      const userMsg: NotebookChatMessage = {
        role: 'user',
        text: userFacingText || ATTACHMENT_ONLY_PLACEHOLDER,
        at: Date.now(),
        attachments: attachmentsSnapshot.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          objectUrl: attachment.file ? URL.createObjectURL(attachment.file) : undefined,
        })),
      };
      setNbThread((thread) => [...thread, userMsg]);
      setDraft('');
      setSending(true);
      setNotebookPendingAction('import');

      const taskTitleSeed =
        importText ||
        attachmentsSnapshot.map((attachment) => attachment.name).join('、') ||
        '新题目';
      const taskId =
        courseId && notebookId
          ? await createAgentTask({
              courseId,
              contactKind: 'notebook',
              contactId: notebookId,
              title: `题库导入：${taskTitleSeed.slice(0, 36)}`,
              detail: '正在解析题目并写入题库…',
              status: 'running',
            })
          : null;

      try {
        const payload = await buildProblemBankImportPayload({
          text: importText,
          attachments: attachmentsSnapshot,
        });
        const { drafts } = await previewNotebookProblemImport({
          notebookId,
          source: payload.source,
          text: payload.text,
          language: 'zh-CN',
        });
        const importedProblems = await commitNotebookProblemImport({
          notebookId,
          drafts,
        });
        void reloadNotebookScenes();

        const notes: string[] = [];
        if (payload.warnings.length > 0) {
          notes.push(`解析提示：${payload.warnings.join('；')}`);
        }
        if (payload.skippedAttachments.length > 0) {
          notes.push(`以下附件未导入：${payload.skippedAttachments.join('、')}`);
        }

        const assistantMsg: NotebookChatMessage = {
          role: 'assistant',
          answer: `已导入 ${importedProblems.length} 道题到题库。你现在可以切到题库页开始做题了。${
            notes.length > 0 ? `\n\n${notes.join('\n')}` : ''
          }`,
          references: [],
          knowledgeGap: false,
          at: Date.now(),
        };
        setNbThread((thread) => [...thread, assistantMsg]);
        setPendingAttachments([]);
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: `已导入 ${importedProblems.length} 道题到题库`,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNbThread((thread) => [
          ...thread,
          {
            role: 'assistant',
            answer: `题库导入失败：${message}`,
            references: [],
            knowledgeGap: false,
            at: Date.now(),
          },
        ]);
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'failed',
            detail: message.slice(0, 300),
          });
        }
      } finally {
        setSending(false);
        setNotebookPendingAction(null);
      }
    },
    [
      courseId,
      draft,
      notebookId,
      pendingAttachments,
      reloadNotebookScenes,
      sending,
      setDraft,
      setNbThread,
      setNotebookPendingAction,
      setPendingAttachments,
      setSending,
    ],
  );

  const handleSendNotebook = useCallback(async () => {
    const text = draft.trim();
    if (!text || !notebookId || sending) return;
    const mc = getCurrentModelConfig();
    if (!mc.isServerConfigured) {
      window.alert('系统模型尚未配置，请联系管理员。');
      return;
    }

    try {
      await Promise.all(
        pendingAttachments
          .filter((a): a is typeof a & { file: File } => Boolean(a.file))
          .map((a) => storeChatAttachmentBlob(a.id, a.file)),
      );
    } catch {
      /* IndexedDB 不可用时仍可发送，仅无法在刷新后再次打开附件 */
    }

    const userMsg: NotebookChatMessage = {
      role: 'user',
      text,
      at: Date.now(),
      attachments: pendingAttachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        objectUrl: a.file ? URL.createObjectURL(a.file) : undefined,
      })),
    };
    setNbThread((t) => [...t, userMsg]);
    setDraft('');
    setSending(true);
    setNotebookPendingAction('chat');
    const taskId =
      courseId && notebookId
        ? await createAgentTask({
            courseId,
            contactKind: 'notebook',
            contactId: notebookId,
            title: `笔记本问答：${text.slice(0, 36)}`,
            detail: '正在生成回答…',
            status: 'running',
          })
        : null;
    try {
      const conversation = [...nbThread, userMsg]
        .slice(-12)
        .map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, content: m.text, at: m.at }
            : { role: 'assistant' as const, content: m.answer, at: m.at },
        );
      if (shouldImportIntoProblemBank(text)) {
        const payload = await buildProblemBankImportPayload({
          text: stripProblemBankImportCommand(text),
          attachments: pendingAttachments,
        });
        const { drafts } = await previewNotebookProblemImport({
          notebookId,
          source: payload.source,
          text: payload.text,
          language: 'zh-CN',
        });
        const importedProblems = await commitNotebookProblemImport({
          notebookId,
          drafts,
        });
        void reloadNotebookScenes();
        const notes: string[] = [];
        if (payload.warnings.length > 0) {
          notes.push(`解析提示：${payload.warnings.join('；')}`);
        }
        if (payload.skippedAttachments.length > 0) {
          notes.push(`以下附件未导入：${payload.skippedAttachments.join('、')}`);
        }
        const assistantMsg: NotebookChatMessage = {
          role: 'assistant',
          answer: `已导入 ${importedProblems.length} 道题到题库。你现在可以切到题库页开始做题了。${
            notes.length > 0 ? `\n\n${notes.join('\n')}` : ''
          }`,
          references: [],
          knowledgeGap: false,
          at: Date.now(),
        };
        setNbThread((t) => [...t, assistantMsg]);
        setPendingAttachments([]);
        if (taskId) {
          await updateAgentTask(taskId, {
            status: 'done',
            detail: `已导入 ${importedProblems.length} 道题到题库`,
          });
        }
        return;
      }
      const plan = await planNotebookMessage(notebookId, text, {
        allowWrite: applyNotebookWrites,
        preferWebSearch: true,
        conversation,
        attachments: pendingAttachments,
      });
      const shouldGenerateSlides = applyNotebookWrites && hasNotebookWrites(plan);
      let appliedLabel = '';

      if (taskId) {
        await updateAgentTask(taskId, {
          detail: shouldGenerateSlides ? '发现知识缺口，正在补充 slides…' : '正在整理现有内容回答…',
          status: 'running',
        });
      }

      if (shouldGenerateSlides) {
        setNbThread((t) => [
          ...t,
          {
            role: 'assistant',
            answer: '我发现当前笔记本还缺少相关知识点，已开始生成补充 slides，请稍等。',
            references: [],
            knowledgeGap: true,
            at: Date.now(),
          },
        ]);
        const applied = await applyNotebookPlan(notebookId, plan);
        appliedLabel = formatAppliedSummary({ applied });
        void reloadNotebookScenes();
      }

      const finalAnswer =
        shouldGenerateSlides && applyNotebookWrites
          ? `${plan.answer}\n\n${appliedLabel ? `已补充内容：${appliedLabel}。` : '已补充相关 slides。'}现在可以开始听讲/查看新增内容了。`
          : !applyNotebookWrites && hasNotebookWrites(plan)
            ? `${plan.answer}\n\n${notebookWritesDisabledHint}`
            : plan.answer;
      const answerDocument =
        shouldGenerateSlides && applyNotebookWrites
          ? appendNotebookAnswerCallout({
              document: plan.answerDocument,
              fallbackText: finalAnswer,
              tone: 'success',
              title: '已补充内容',
              text: appliedLabel
                ? `${appliedLabel}。现在可以开始听讲或查看新增内容了。`
                : '已补充相关 slides，现在可以开始听讲或查看新增内容了。',
            })
          : !applyNotebookWrites && hasNotebookWrites(plan)
            ? appendNotebookAnswerCallout({
                document: plan.answerDocument,
                fallbackText: finalAnswer,
                tone: 'info',
                title: '未自动写入笔记本',
                text: notebookWritesDisabledHint,
              })
            : plan.answerDocument;
      const assistantMsg: NotebookChatMessage = {
        role: 'assistant',
        answer: finalAnswer,
        answerDocument,
        references: plan.references || [],
        knowledgeGap: plan.knowledgeGap,
        prerequisiteHints: plan.prerequisiteHints,
        webSearchUsed: plan.webSearchUsed,
        appliedLabel: appliedLabel || undefined,
        lessonSourceQuestion: shouldOfferMicroLessonButton(text) ? text : undefined,
        at: Date.now(),
      };
      setNbThread((t) => [...t, assistantMsg]);
      setPendingAttachments([]);
      if (taskId) {
        await updateAgentTask(taskId, {
          status: 'done',
          detail:
            shouldGenerateSlides && applyNotebookWrites
              ? `已完成并补充内容：${appliedLabel || '新增 slides'}`
              : plan.knowledgeGap
                ? '已完成（含知识缺口建议）'
                : '已完成',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNbThread((t) => [
        ...t,
        {
          role: 'assistant',
          answer: `请求失败：${msg}`,
          references: [],
          knowledgeGap: false,
          at: Date.now(),
        },
      ]);
      if (taskId) {
        await updateAgentTask(taskId, { status: 'failed', detail: msg.slice(0, 300) });
      }
    } finally {
      setSending(false);
      setNotebookPendingAction(null);
    }
  }, [
    applyNotebookWrites,
    courseId,
    draft,
    nbThread,
    notebookId,
    notebookWritesDisabledHint,
    pendingAttachments,
    reloadNotebookScenes,
    sending,
    setDraft,
    setNbThread,
    setNotebookPendingAction,
    setPendingAttachments,
    setSending,
  ]);

  return {
    handleImportNotebookProblemBank,
    handleSendNotebook,
    persistNotebookConversation,
    runNotebookSubtask,
  };
}
