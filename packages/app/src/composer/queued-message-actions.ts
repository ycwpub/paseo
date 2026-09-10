import type { ComposerAttachment } from "@/attachments/types";
import type { QueueWriter, QueuedComposerMessage } from "@/composer/actions";
import { i18n } from "@/i18n/i18next";

export interface RemoveQueuedComposerMessageInput {
  agentId: string;
  messageId: string;
  queue: QueueWriter;
}

export interface MoveQueuedComposerMessageInput {
  agentId: string;
  messageId: string;
  direction: "up" | "down";
  queue: QueueWriter;
}

export interface ReorderQueuedComposerMessagesInput {
  agentId: string;
  orderedMessageIds: readonly string[];
  queue: QueueWriter;
}

export function removeQueuedComposerMessage(
  input: RemoveQueuedComposerMessageInput,
): QueuedComposerMessage | null {
  const item = input.queue.read(input.agentId).find((message) => message.id === input.messageId);
  if (!item) return null;
  input.queue.write((previousQueues) => {
    const nextQueues = new Map(previousQueues);
    nextQueues.set(
      input.agentId,
      (previousQueues.get(input.agentId) ?? []).filter((message) => message.id !== input.messageId),
    );
    return nextQueues;
  });
  return item;
}

export function moveQueuedComposerMessage(input: MoveQueuedComposerMessageInput): boolean {
  let moved = false;
  input.queue.write((previousQueues) => {
    const messages = [...(previousQueues.get(input.agentId) ?? [])];
    const currentIndex = messages.findIndex((message) => message.id === input.messageId);
    if (currentIndex === -1) return previousQueues;
    const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= messages.length) return previousQueues;

    const [message] = messages.splice(currentIndex, 1);
    messages.splice(targetIndex, 0, message);
    const nextQueues = new Map(previousQueues);
    nextQueues.set(input.agentId, messages);
    moved = true;
    return nextQueues;
  });
  return moved;
}

export function reorderQueuedComposerMessages(input: ReorderQueuedComposerMessagesInput): boolean {
  if (new Set(input.orderedMessageIds).size !== input.orderedMessageIds.length) {
    return false;
  }

  let reordered = false;
  input.queue.write((previousQueues) => {
    const messages = previousQueues.get(input.agentId) ?? [];
    const messageById = new Map(messages.map((message) => [message.id, message]));
    const orderedMessageIds = new Set(input.orderedMessageIds);
    const orderedMessages = input.orderedMessageIds.flatMap((id) => {
      const message = messageById.get(id);
      return message ? [message] : [];
    });
    const messagesAddedDuringDrag = messages.filter(
      (message) => !orderedMessageIds.has(message.id),
    );
    const nextMessages = [...orderedMessages, ...messagesAddedDuringDrag];
    const isUnchanged = nextMessages.every((message, index) => message === messages[index]);
    if (isUnchanged) return previousQueues;

    const nextQueues = new Map(previousQueues);
    nextQueues.set(input.agentId, nextMessages);
    reordered = true;
    return nextQueues;
  });
  return reordered;
}

export interface SendQueuedComposerMessageNowInput {
  agentId: string;
  messageId: string;
  queue: QueueWriter;
  submitMessage: (input: {
    text: string;
    attachments: ComposerAttachment[];
    selectedMcpServerIds?: string[];
    selectedSkillIds?: string[];
  }) => Promise<void>;
  failedToSendMessage?: string;
}

export type SendQueuedComposerMessageNowResult =
  | { status: "missing" }
  | { status: "submitted" }
  | { status: "failed"; errorMessage: string };

export async function sendQueuedComposerMessageNow(
  input: SendQueuedComposerMessageNowInput,
): Promise<SendQueuedComposerMessageNowResult> {
  const queue = input.queue.read(input.agentId);
  const originalIndex = queue.findIndex((message) => message.id === input.messageId);
  const item = queue[originalIndex];
  if (!item) return { status: "missing" };

  input.queue.write((previousQueues) => {
    const nextQueues = new Map(previousQueues);
    nextQueues.set(
      input.agentId,
      (previousQueues.get(input.agentId) ?? []).filter((message) => message.id !== input.messageId),
    );
    return nextQueues;
  });

  try {
    await input.submitMessage({
      text: item.text,
      attachments: item.attachments,
      selectedMcpServerIds: item.selectedMcpServerIds,
      selectedSkillIds: item.selectedSkillIds,
    });
    return { status: "submitted" };
  } catch (error) {
    input.queue.write((previousQueues) => {
      const nextQueues = new Map(previousQueues);
      const messages = [...(previousQueues.get(input.agentId) ?? [])];
      messages.splice(Math.min(originalIndex, messages.length), 0, item);
      nextQueues.set(input.agentId, messages);
      return nextQueues;
    });
    return {
      status: "failed",
      errorMessage:
        error instanceof Error
          ? error.message
          : (input.failedToSendMessage ?? i18n.t("composer.errors.failedToSend")),
    };
  }
}
