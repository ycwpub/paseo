import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

const CONTEXT_WINDOW_MS = 30 * 60 * 1_000;
const MAX_CONTEXT_MESSAGES_PER_SIDE = 10;

function normalizeTimestamp(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value < 10_000_000_000 ? value * 1_000 : value;
}

function compareEvents(
  left: NormalizedLarkMessageEvent,
  right: NormalizedLarkMessageEvent,
): number {
  return (
    (normalizeTimestamp(left.createTime) ?? 0) - (normalizeTimestamp(right.createTime) ?? 0) ||
    left.messageId.localeCompare(right.messageId)
  );
}

function dedupeEvents(events: readonly NormalizedLarkMessageEvent[]): NormalizedLarkMessageEvent[] {
  const byMessageId = new Map<string, NormalizedLarkMessageEvent>();
  for (const event of events) {
    byMessageId.set(event.messageId, event);
  }
  return [...byMessageId.values()].sort(compareEvents);
}

export function selectLarkSubstituteSupplementalEvents(input: {
  latestEvent: NormalizedLarkMessageEvent;
  events: readonly NormalizedLarkMessageEvent[];
}): NormalizedLarkMessageEvent[] {
  const candidates = dedupeEvents(input.events).filter(
    (event) =>
      event.chatId === input.latestEvent.chatId && event.messageId !== input.latestEvent.messageId,
  );
  const currentTime = normalizeTimestamp(input.latestEvent.createTime);
  if (input.latestEvent.chatType?.toLowerCase() === "p2p") {
    const previous = candidates.filter((event) => {
      const eventTime = normalizeTimestamp(event.createTime);
      return currentTime === null || eventTime === null || eventTime <= currentTime;
    });
    return previous.slice(-MAX_CONTEXT_MESSAGES_PER_SIDE);
  }
  const previous = candidates.filter((event) => {
    const eventTime = normalizeTimestamp(event.createTime);
    return currentTime === null || eventTime === null || eventTime <= currentTime;
  });
  const following = candidates.filter((event) => {
    const eventTime = normalizeTimestamp(event.createTime);
    return currentTime !== null && eventTime !== null && eventTime > currentTime;
  });
  return [
    ...previous.slice(-MAX_CONTEXT_MESSAGES_PER_SIDE),
    ...following.slice(0, MAX_CONTEXT_MESSAGES_PER_SIDE),
  ];
}

export async function collectLarkSubstituteMessageContext(input: {
  latestEvent: NormalizedLarkMessageEvent;
  bufferedEvents: readonly NormalizedLarkMessageEvent[];
  now?: Date;
  listChatMessages?: (window: { start: Date; end: Date }) => Promise<NormalizedLarkMessageEvent[]>;
}): Promise<NormalizedLarkMessageEvent[]> {
  const currentTime = normalizeTimestamp(input.latestEvent.createTime) ?? Date.now();
  const now = input.now ?? new Date();
  let history: NormalizedLarkMessageEvent[] = [];
  if (input.listChatMessages) {
    history = await input.listChatMessages({
      start: new Date(currentTime - CONTEXT_WINDOW_MS),
      end: now,
    });
  }
  return selectLarkSubstituteSupplementalEvents({
    latestEvent: input.latestEvent,
    events: [...history, ...input.bufferedEvents],
  });
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatTimestamp(value: number | null): string {
  const normalized = normalizeTimestamp(value);
  if (normalized === null) return "unknown";
  return new Date(normalized).toISOString();
}

export function appendLarkSubstituteMessageContext(input: {
  prompt: string;
  latestEvent: NormalizedLarkMessageEvent;
  supplementalEvents: readonly NormalizedLarkMessageEvent[];
}): string {
  if (input.supplementalEvents.length === 0) return input.prompt;
  const isPrivate = input.latestEvent.chatType?.toLowerCase() === "p2p";
  const messages = input.supplementalEvents.map(
    (event) =>
      `  <message id="${xmlEscape(event.messageId)}" time="${xmlEscape(formatTimestamp(event.createTime))}" sender="${xmlEscape(event.displayName)}">${xmlEscape(event.text)}</message>`,
  );
  return [
    input.prompt,
    "",
    `<lark_substitute_message_context kind="${isPrivate ? "private_previous" : "group_surrounding"}">`,
    isPrivate
      ? "The final private-chat message is the only question to answer. Earlier messages below are supplemental context."
      : "The latest message that mentions the substituted user is the only question to answer. Messages before and after it below are supplemental context.",
    ...messages,
    "</lark_substitute_message_context>",
  ].join("\n");
}
