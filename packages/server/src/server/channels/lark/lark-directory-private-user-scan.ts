import type { LarkDirectory, LarkDirectoryRecentPrivateUser } from "@getpaseo/protocol/messages";
import { normalizeLarkApiMessage, type NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { toLarkDirectoryMessageTime } from "./lark-directory-message.js";

function isHumanPrivateMessage(event: NormalizedLarkMessageEvent): boolean {
  const senderType = event.senderType?.toLowerCase();
  const chatType = event.chatType?.toLowerCase();
  return (
    Boolean(event.openId) &&
    (chatType === "p2p" || chatType === "p2p_chat") &&
    senderType !== "app" &&
    senderType !== "bot"
  );
}

function normalizePrivateSearchMessage(rawMessage: unknown): NormalizedLarkMessageEvent | null {
  const event = normalizeLarkApiMessage(rawMessage, "");
  if (!event) return null;
  const record =
    rawMessage && typeof rawMessage === "object" && !Array.isArray(rawMessage)
      ? (rawMessage as Record<string, unknown>)
      : null;
  let explicitChatType = "";
  if (typeof record?.chat_type === "string") {
    explicitChatType = record.chat_type.trim();
  } else if (typeof record?.chatType === "string") {
    explicitChatType = record.chatType.trim();
  }
  if (explicitChatType) return event;

  // searchPrivateMessagesAsUser limits the search API to p2p_chat, but the
  // message-detail API can omit chat_type. Preserve that source semantics
  // locally instead of changing the global message normalizer's group fallback.
  return { ...event, chatType: "p2p" };
}

export function collectRecentLarkPrivateUsers(input: {
  appId: string;
  rawMessages: readonly unknown[];
  currentUserOpenId: string | null;
  directory: LarkDirectory;
  now: string;
}): LarkDirectoryRecentPrivateUser[] {
  const events = input.rawMessages
    .map(normalizePrivateSearchMessage)
    .filter((event): event is NormalizedLarkMessageEvent => Boolean(event))
    .filter(isHumanPrivateMessage);
  const peerByChatId = new Map<string, NormalizedLarkMessageEvent>();
  for (const event of events) {
    if (event.chatId && event.openId && event.openId !== input.currentUserOpenId) {
      peerByChatId.set(event.chatId, event);
    }
  }
  const byOpenId = new Map<string, NormalizedLarkMessageEvent[]>();
  for (const event of events) {
    let peerEvent = event;
    if (event.openId === input.currentUserOpenId) {
      const knownPeer = peerByChatId.get(event.chatId);
      if (!knownPeer) continue;
      peerEvent = {
        ...event,
        openId: knownPeer.openId,
        displayName: knownPeer.displayName,
      };
    }
    if (!peerEvent.openId) continue;
    const peerEvents = byOpenId.get(peerEvent.openId) ?? [];
    peerEvents.push(peerEvent);
    byOpenId.set(peerEvent.openId, peerEvents);
  }

  return [...byOpenId.entries()]
    .flatMap(([openId, peerEvents]) => {
      peerEvents.sort((left, right) => (left.createTime ?? 0) - (right.createTime ?? 0));
      const first = peerEvents[0];
      const last = peerEvents.at(-1);
      if (!first || !last) return [];
      const existing = input.directory.users.find(
        (user) => user.appId === input.appId && user.openId === openId,
      );
      return [
        {
          appId: input.appId,
          openId,
          displayName: last.displayName.trim() || first.displayName.trim() || null,
          firstMessageContent: first.text,
          firstMessageAt: toLarkDirectoryMessageTime(first.createTime, input.now),
          lastMessageContent: last.text,
          lastMessageAt: toLarkDirectoryMessageTime(last.createTime, input.now),
          messageCount: peerEvents.length,
          inDirectory: Boolean(existing),
        },
      ];
    })
    .sort((left, right) => Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt));
}
