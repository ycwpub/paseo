import type { ComposerAttachment } from "@/attachments/types";
import type { QueueWriter, QueuedComposerMessage } from "@/composer/actions";

export interface QueuedMessageEditSession {
  agentId: string;
  message: QueuedComposerMessage;
  originalIndex: number;
  previousMessageId: string | null;
  nextMessageId: string | null;
}

interface BeginQueuedMessageEditInput {
  agentId: string;
  messageId: string;
  queue: QueueWriter;
}

interface FinishQueuedMessageEditInput {
  session: QueuedMessageEditSession;
  text: string;
  attachments: ComposerAttachment[];
  selectedMcpServerIds: string[];
  selectedSkillIds: string[];
  queue: QueueWriter;
}

interface CancelQueuedMessageEditInput {
  session: QueuedMessageEditSession;
  queue: QueueWriter;
}

function withoutEditingMarker(message: QueuedComposerMessage): QueuedComposerMessage {
  const { isEditing: _isEditing, ...rest } = message;
  return rest;
}

function insertAtReservedPosition(
  messages: QueuedComposerMessage[],
  session: QueuedMessageEditSession,
  message: QueuedComposerMessage,
): QueuedComposerMessage[] {
  const next = messages.filter((item) => item.id !== message.id);
  const nextIndex = session.nextMessageId
    ? next.findIndex((item) => item.id === session.nextMessageId)
    : -1;
  if (nextIndex >= 0) {
    next.splice(nextIndex, 0, message);
    return next;
  }

  const previousIndex = session.previousMessageId
    ? next.findIndex((item) => item.id === session.previousMessageId)
    : -1;
  if (previousIndex >= 0) {
    next.splice(previousIndex + 1, 0, message);
    return next;
  }

  next.splice(Math.min(session.originalIndex, next.length), 0, message);
  return next;
}

export function beginQueuedMessageEdit(
  input: BeginQueuedMessageEditInput,
): QueuedMessageEditSession | null {
  let session: QueuedMessageEditSession | null = null;
  input.queue.write((previousQueues) => {
    const messages = [...(previousQueues.get(input.agentId) ?? [])];
    if (messages.some((message) => message.isEditing)) {
      return previousQueues;
    }
    const index = messages.findIndex((message) => message.id === input.messageId);
    const message = messages[index];
    if (!message) {
      return previousQueues;
    }
    session = {
      agentId: input.agentId,
      message: withoutEditingMarker(message),
      originalIndex: index,
      previousMessageId: messages[index - 1]?.id ?? null,
      nextMessageId: messages[index + 1]?.id ?? null,
    };
    messages[index] = { ...message, isEditing: true };
    const nextQueues = new Map(previousQueues);
    nextQueues.set(input.agentId, messages);
    return nextQueues;
  });
  return session;
}

export function finishQueuedMessageEdit(input: FinishQueuedMessageEditInput): boolean {
  const text = input.text.trim();
  if (!text && input.attachments.length === 0) {
    return false;
  }

  const message: QueuedComposerMessage = {
    ...input.session.message,
    text,
    attachments: input.attachments,
    selectedMcpServerIds: input.selectedMcpServerIds,
    selectedSkillIds: input.selectedSkillIds,
  };
  input.queue.write((previousQueues) => {
    const messages = [...(previousQueues.get(input.session.agentId) ?? [])];
    const index = messages.findIndex((item) => item.id === input.session.message.id);
    if (index >= 0) {
      messages[index] = message;
    } else {
      const restored = insertAtReservedPosition(messages, input.session, message);
      const nextQueues = new Map(previousQueues);
      nextQueues.set(input.session.agentId, restored);
      return nextQueues;
    }
    const nextQueues = new Map(previousQueues);
    nextQueues.set(input.session.agentId, messages);
    return nextQueues;
  });
  return true;
}

export function cancelQueuedMessageEdit(input: CancelQueuedMessageEditInput): void {
  const original = withoutEditingMarker(input.session.message);
  input.queue.write((previousQueues) => {
    const messages = [...(previousQueues.get(input.session.agentId) ?? [])];
    const index = messages.findIndex((item) => item.id === original.id);
    if (index >= 0) {
      messages[index] = original;
    } else {
      const restored = insertAtReservedPosition(messages, input.session, original);
      const nextQueues = new Map(previousQueues);
      nextQueues.set(input.session.agentId, restored);
      return nextQueues;
    }
    const nextQueues = new Map(previousQueues);
    nextQueues.set(input.session.agentId, messages);
    return nextQueues;
  });
}

export function getVisibleQueuedMessages(
  messages: readonly QueuedComposerMessage[],
): QueuedComposerMessage[] {
  return messages.filter((message) => !message.isEditing);
}

export function getNextQueuedMessage(
  messages: readonly QueuedComposerMessage[],
): QueuedComposerMessage | null {
  const first = messages[0];
  return first && !first.isEditing ? first : null;
}
