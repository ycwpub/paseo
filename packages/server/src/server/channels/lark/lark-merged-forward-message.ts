import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import type { LarkChannelClientAdapter, LarkMessageGetOptions } from "./lark-client-adapter.js";
import { normalizeLarkApiMessage, type NormalizedLarkMessageEvent } from "./lark-message-format.js";

export const LARK_MERGED_FORWARD_MESSAGE_TYPE = "merge_forward";

export function isLarkMergedForwardMessage(event: NormalizedLarkMessageEvent): boolean {
  return event.messageType?.toLowerCase() === LARK_MERGED_FORWARD_MESSAGE_TYPE;
}

export function expandLarkMergedForwardMessage(
  parent: NormalizedLarkMessageEvent,
  items: readonly unknown[],
): NormalizedLarkMessageEvent[] {
  const expanded = new Map<string, NormalizedLarkMessageEvent>();
  for (const item of items) {
    const child = normalizeLarkApiMessage(item, parent.chatId);
    if (
      !child ||
      child.messageId === parent.messageId ||
      child.messageType?.toLowerCase() === LARK_MERGED_FORWARD_MESSAGE_TYPE
    ) {
      continue;
    }
    const childMessageId = child.messageId;
    const messageId = `${parent.messageId}:${childMessageId}`;
    expanded.set(messageId, {
      ...child,
      eventId: `merged-forward:${parent.messageId}:${childMessageId}`,
      messageId,
      chatId: parent.chatId,
      chatType: parent.chatType ?? child.chatType,
      threadId: parent.threadId,
      rootMessageId: parent.rootMessageId ?? parent.messageId,
      quotedMessageId: null,
      createTime: parent.createTime ?? child.createTime,
    });
  }
  return [...expanded.values()];
}

export async function resolveLarkMergedForwardMessage(
  adapter: Pick<LarkChannelClientAdapter, "getMessageItems">,
  config: StoredLarkChannelConfig,
  event: NormalizedLarkMessageEvent,
  options?: LarkMessageGetOptions,
): Promise<NormalizedLarkMessageEvent[]> {
  if (!isLarkMergedForwardMessage(event)) return [event];
  if (!adapter.getMessageItems) return [];
  const items = await adapter.getMessageItems(config, event.messageId, options);
  return expandLarkMergedForwardMessage(event, items);
}
