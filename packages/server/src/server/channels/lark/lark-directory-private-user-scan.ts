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

export function collectRecentLarkPrivateUsers(input: {
  appId: string;
  rawMessages: readonly unknown[];
  currentUserOpenId: string | null;
  directory: LarkDirectory;
  now: string;
}): LarkDirectoryRecentPrivateUser[] {
  const byOpenId = new Map<string, NormalizedLarkMessageEvent[]>();
  for (const rawMessage of input.rawMessages) {
    const event = normalizeLarkApiMessage(rawMessage, "");
    if (
      !event ||
      !isHumanPrivateMessage(event) ||
      !event.openId ||
      event.openId === input.currentUserOpenId
    ) {
      continue;
    }
    const events = byOpenId.get(event.openId) ?? [];
    events.push(event);
    byOpenId.set(event.openId, events);
  }

  return [...byOpenId.entries()]
    .flatMap(([openId, events]) => {
      events.sort((left, right) => (left.createTime ?? 0) - (right.createTime ?? 0));
      const first = events[0];
      const last = events.at(-1);
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
          messageCount: events.length,
          inDirectory: Boolean(existing),
        },
      ];
    })
    .sort((left, right) => Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt));
}
