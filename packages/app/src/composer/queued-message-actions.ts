import type { ComposerAttachment } from "@/attachments/types";
import type { QueueWriter, QueuedComposerMessage } from "@/composer/actions";
import { i18n } from "@/i18n/i18next";

export interface RemoveQueuedComposerMessageInput {
  agentId: string;
  messageId: string;
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
