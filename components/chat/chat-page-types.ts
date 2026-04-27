import type { UIMessage } from 'ai';
import type { ChatMessageMetadata } from '@/lib/types/chat';
import type { NotebookKnowledgeReference } from '@/lib/types/notebook-message';
import type { ProtocolMessageEnvelope } from '@/lib/types/agent-chat-protocol';
import type { NotebookContentDocument } from '@/lib/notebook-content';
import type { Scene } from '@/lib/types/stage';
import type { StageListItem } from '@/lib/utils/stage-storage';

export type NotebookChatMessage =
  | {
      role: 'user';
      text: string;
      at: number;
      attachments?: ChatMessageMetadata['attachments'];
    }
  | {
      role: 'assistant';
      answer: string;
      answerDocument?: NotebookContentDocument;
      references: NotebookKnowledgeReference[];
      knowledgeGap: boolean;
      prerequisiteHints?: string[];
      webSearchUsed?: boolean;
      appliedLabel?: string;
      lessonSourceQuestion?: string;
      lessonDeckScenes?: Scene[];
      lessonSavedLabel?: string;
      lessonError?: string;
      at: number;
    };

export type NotebookAttachmentInput = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExcerpt?: string;
  /** 原始文件；PDF / Markdown 可在总控创建时进入完整笔记本生成管线 */
  file?: File;
};

export type OrchestratorChildTaskView = {
  id: string;
  title: string;
  detail?: string;
  status: 'running' | 'waiting' | 'done' | 'failed';
  contactId: string;
  updatedAt: number;
  lastEnvelope?: ProtocolMessageEnvelope;
};

export type NotebookRouteDecision =
  | { type: 'create' }
  | { type: 'single'; notebook: StageListItem }
  | { type: 'multi'; notebooks: StageListItem[] };

export type OrchestratorViewMode = 'private' | 'group';

/** 课程总控私聊：生成笔记本走完整管线；发送消息为向总控直接问答，不自动创建笔记本 */
export type OrchestratorComposerMode = 'generate-notebook' | 'send-message';

export type NotebookSubtaskResult = {
  notebook: StageListItem;
  answer: string;
  appliedLabel?: string;
  knowledgeGap: boolean;
};

export type AgentChatMessage = UIMessage<ChatMessageMetadata>;
