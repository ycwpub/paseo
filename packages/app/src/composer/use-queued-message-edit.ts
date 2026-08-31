import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  ComposerAttachment,
  UserComposerAttachment,
  WorkspaceComposerAttachment,
} from "@/attachments/types";
import {
  isWorkspaceAttachment,
  userAttachmentsOnly,
} from "@/attachments/workspace-attachment-utils";
import type { QueueWriter, QueuedComposerMessage } from "@/composer/actions";
import type { ResourceAwareQueuedComposerMessage } from "@/composer/resource-selection";
import {
  beginQueuedMessageEdit,
  cancelQueuedMessageEdit,
  finishQueuedMessageEdit,
  getVisibleQueuedMessages,
  type QueuedMessageEditSession,
} from "@/composer/queued-message-edit";

interface ResourceSelection {
  selectedMcpServerIds: string[];
  selectedSkillIds: string[];
}

interface DraftSnapshot extends ResourceSelection {
  text: string;
  attachments: UserComposerAttachment[];
}

interface ActiveEdit {
  serverId: string;
  queueSession: QueuedMessageEditSession;
  previousDraft: DraftSnapshot;
  workspaceAttachments: WorkspaceComposerAttachment[];
}

interface UseQueuedMessageEditInput extends ResourceSelection {
  serverId: string;
  agentId: string;
  queue: QueueWriter;
  queuedMessages: readonly QueuedComposerMessage[];
  text: string;
  attachments: UserComposerAttachment[];
  currentDraftAttachments: ComposerAttachment[];
  setText: (text: string) => void;
  setAttachments: (
    value:
      | UserComposerAttachment[]
      | ((current: UserComposerAttachment[]) => UserComposerAttachment[]),
  ) => void;
  setSelectedMcpServerIds: Dispatch<SetStateAction<string[]>>;
  setSelectedSkillIds: Dispatch<SetStateAction<string[]>>;
  suppressCurrentWorkspaceAttachments: (attachments: readonly ComposerAttachment[]) => void;
  resetWorkspaceAttachmentSuppression: () => void;
  focusInput: () => void;
  clearError: () => void;
  resumeQueue: () => void;
}

interface SubmitQueuedMessageEditInput {
  text: string;
}

interface UseQueuedMessageEditResult {
  isActive: boolean;
  selectedAttachments: ComposerAttachment[];
  visibleMessages: ResourceAwareQueuedComposerMessage[];
  begin: (messageId: string) => void;
  cancel: () => void;
  submit: (input: SubmitQueuedMessageEditInput) => boolean;
  removeAttachment: (index: number) => boolean;
}

export function useQueuedMessageEdit(input: UseQueuedMessageEditInput): UseQueuedMessageEditResult {
  const {
    serverId,
    agentId,
    queue,
    queuedMessages,
    text: draftText,
    attachments,
    currentDraftAttachments,
    selectedMcpServerIds,
    selectedSkillIds,
    setText,
    setAttachments,
    setSelectedMcpServerIds,
    setSelectedSkillIds,
    suppressCurrentWorkspaceAttachments,
    resetWorkspaceAttachmentSuppression,
    focusInput,
    clearError,
    resumeQueue,
  } = input;
  const [edit, setEdit] = useState<ActiveEdit | null>(null);
  const editRef = useRef<ActiveEdit | null>(null);
  const isCurrent = edit?.serverId === serverId && edit.queueSession.agentId === agentId;
  const activeEdit = isCurrent ? edit : null;

  const updateEdit = useCallback((next: ActiveEdit | null) => {
    editRef.current = next;
    setEdit(next);
  }, []);

  const selectedAttachments = useMemo<ComposerAttachment[]>(
    () =>
      activeEdit ? [...attachments, ...activeEdit.workspaceAttachments] : currentDraftAttachments,
    [activeEdit, attachments, currentDraftAttachments],
  );
  const visibleMessages = useMemo(() => getVisibleQueuedMessages(queuedMessages), [queuedMessages]);

  const restoreDraft = useCallback(
    (currentEdit: ActiveEdit) => {
      updateEdit(null);
      setText(currentEdit.previousDraft.text);
      setAttachments(currentEdit.previousDraft.attachments);
      setSelectedMcpServerIds(currentEdit.previousDraft.selectedMcpServerIds);
      setSelectedSkillIds(currentEdit.previousDraft.selectedSkillIds);
      resetWorkspaceAttachmentSuppression();
      focusInput();
    },
    [
      focusInput,
      resetWorkspaceAttachmentSuppression,
      setAttachments,
      setSelectedMcpServerIds,
      setSelectedSkillIds,
      setText,
      updateEdit,
    ],
  );

  const begin = useCallback(
    (messageId: string) => {
      if (editRef.current) return;
      const queueSession = beginQueuedMessageEdit({
        agentId,
        messageId,
        queue,
      });
      if (!queueSession) return;

      const nextEdit: ActiveEdit = {
        serverId,
        queueSession,
        previousDraft: {
          text: draftText,
          attachments: [...attachments],
          selectedMcpServerIds: [...selectedMcpServerIds],
          selectedSkillIds: [...selectedSkillIds],
        },
        workspaceAttachments: queueSession.message.attachments.filter(isWorkspaceAttachment),
      };
      suppressCurrentWorkspaceAttachments(currentDraftAttachments);
      updateEdit(nextEdit);
      setText(queueSession.message.text);
      setAttachments(userAttachmentsOnly(queueSession.message.attachments));
      setSelectedMcpServerIds(queueSession.message.selectedMcpServerIds ?? selectedMcpServerIds);
      setSelectedSkillIds(queueSession.message.selectedSkillIds ?? selectedSkillIds);
      clearError();
      focusInput();
    },
    [
      agentId,
      attachments,
      clearError,
      currentDraftAttachments,
      focusInput,
      queue,
      selectedMcpServerIds,
      selectedSkillIds,
      serverId,
      setAttachments,
      setSelectedMcpServerIds,
      setSelectedSkillIds,
      setText,
      suppressCurrentWorkspaceAttachments,
      draftText,
      updateEdit,
    ],
  );

  const cancel = useCallback(() => {
    const currentEdit = editRef.current;
    if (!currentEdit) return;
    cancelQueuedMessageEdit({
      session: currentEdit.queueSession,
      queue,
    });
    restoreDraft(currentEdit);
    resumeQueue();
  }, [queue, restoreDraft, resumeQueue]);

  const submit = useCallback(
    ({ text: nextText }: SubmitQueuedMessageEditInput): boolean => {
      const currentEdit = editRef.current;
      if (!currentEdit) return false;
      const finished = finishQueuedMessageEdit({
        session: currentEdit.queueSession,
        text: nextText,
        attachments: selectedAttachments,
        selectedMcpServerIds,
        selectedSkillIds,
        queue,
      });
      if (!finished) return true;

      restoreDraft(currentEdit);
      resumeQueue();
      return true;
    },
    [queue, restoreDraft, resumeQueue, selectedMcpServerIds, selectedAttachments, selectedSkillIds],
  );

  const removeAttachment = useCallback(
    (index: number): boolean => {
      const currentEdit = editRef.current;
      if (!currentEdit) return false;
      const attachment = selectedAttachments[index];
      if (!isWorkspaceAttachment(attachment)) {
        setAttachments((current) =>
          current.filter((_item, currentIndex) => currentIndex !== index),
        );
        return true;
      }

      const workspaceIndex = index - attachments.length;
      if (workspaceIndex < 0) return true;
      const workspaceAttachments = currentEdit.workspaceAttachments.filter(
        (_item, currentIndex) => currentIndex !== workspaceIndex,
      );
      updateEdit({ ...currentEdit, workspaceAttachments });
      return true;
    },
    [attachments.length, selectedAttachments, setAttachments, updateEdit],
  );

  useEffect(
    () => () => {
      const currentEdit = editRef.current;
      if (
        !currentEdit ||
        currentEdit.serverId !== serverId ||
        currentEdit.queueSession.agentId !== agentId
      ) {
        return;
      }
      cancelQueuedMessageEdit({
        session: currentEdit.queueSession,
        queue,
      });
      setText(currentEdit.previousDraft.text);
      setAttachments(currentEdit.previousDraft.attachments);
      resetWorkspaceAttachmentSuppression();
      resumeQueue();
      editRef.current = null;
      setEdit(null);
    },
    [
      agentId,
      queue,
      resetWorkspaceAttachmentSuppression,
      resumeQueue,
      serverId,
      setAttachments,
      setText,
    ],
  );

  return {
    isActive: activeEdit !== null,
    selectedAttachments,
    visibleMessages,
    begin,
    cancel,
    submit,
    removeAttachment,
  };
}
