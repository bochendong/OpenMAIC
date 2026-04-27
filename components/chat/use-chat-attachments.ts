import {
  useCallback,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  extractTextExcerpt,
  isNotebookPipelineSourceFile,
} from './chat-attachment-utils';
import type {
  NotebookAttachmentInput,
  OrchestratorComposerMode,
  OrchestratorViewMode,
} from './chat-page-types';

function isFileDragEvent(event: Pick<ReactDragEvent<HTMLDivElement>, 'dataTransfer'>) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function useChatAttachments({
  supportsComposerAttachments,
  sending,
  isCourseOrchestrator,
  orchestratorViewMode,
  orchestratorComposerMode,
  switchOrchestratorComposer,
}: {
  supportsComposerAttachments: boolean;
  sending: boolean;
  isCourseOrchestrator: boolean;
  orchestratorViewMode: OrchestratorViewMode;
  orchestratorComposerMode: OrchestratorComposerMode;
  switchOrchestratorComposer: (mode: OrchestratorComposerMode) => void;
}) {
  const [pendingAttachments, setPendingAttachments] = useState<NotebookAttachmentInput[]>([]);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerDragDepthRef = useRef(0);

  const openAttachmentPicker = () => {
    fileInputRef.current?.click();
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const onPickAttachments = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const selected = Array.from(files).slice(0, 6);
      const built: NotebookAttachmentInput[] = [];
      for (const file of selected) {
        const textExcerpt = await extractTextExcerpt(file);
        built.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          textExcerpt,
          file,
        });
      }
      setPendingAttachments((prev) => [...prev, ...built].slice(-6));
      if (
        isCourseOrchestrator &&
        orchestratorViewMode === 'private' &&
        orchestratorComposerMode === 'send-message' &&
        built.some((attachment) => attachment.file && isNotebookPipelineSourceFile(attachment.file))
      ) {
        switchOrchestratorComposer('generate-notebook');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [
      isCourseOrchestrator,
      orchestratorComposerMode,
      orchestratorViewMode,
      switchOrchestratorComposer,
    ],
  );

  const handleComposerDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!supportsComposerAttachments || sending || !isFileDragEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      composerDragDepthRef.current += 1;
      setIsComposerDragging(true);
    },
    [sending, supportsComposerAttachments],
  );

  const handleComposerDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!supportsComposerAttachments || sending || !isFileDragEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      if (!isComposerDragging) setIsComposerDragging(true);
    },
    [isComposerDragging, sending, supportsComposerAttachments],
  );

  const handleComposerDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!supportsComposerAttachments || sending || !isFileDragEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
      if (composerDragDepthRef.current === 0) {
        setIsComposerDragging(false);
      }
    },
    [sending, supportsComposerAttachments],
  );

  const handleComposerDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!supportsComposerAttachments || sending || !isFileDragEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      composerDragDepthRef.current = 0;
      setIsComposerDragging(false);
      void onPickAttachments(event.dataTransfer.files);
    },
    [onPickAttachments, sending, supportsComposerAttachments],
  );

  return {
    fileInputRef,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    isComposerDragging,
    onPickAttachments,
    openAttachmentPicker,
    pendingAttachments,
    removePendingAttachment,
    setPendingAttachments,
  };
}
