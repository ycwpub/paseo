import type { LarkDirectoryChat, LarkDirectoryUser } from "@getpaseo/protocol/messages";

interface LarkUserIdentity {
  displayName?: string | null;
  email?: string | null;
  openId?: string | null;
}

function compactIdentityParts(parts: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(parts.map((part) => part?.trim() ?? "").filter(Boolean)));
}

function formatIdentityParts(parts: readonly (string | null | undefined)[]): string {
  const [primary, ...details] = compactIdentityParts(parts);
  if (!primary) return "";
  return details.length > 0 ? `${primary}（${details.join("，")}）` : primary;
}

export function formatLarkUserIdentity(user: LarkUserIdentity): string {
  return formatIdentityParts([user.displayName, user.email, user.openId]);
}

export function formatLarkUserLabel(user: LarkDirectoryUser): string {
  return formatLarkUserIdentity(user);
}

export function formatLarkChatLabel(chat: LarkDirectoryChat): string {
  return formatIdentityParts([chat.name, chat.groupId, chat.chatId]);
}

export function findLarkDirectoryUser(
  users: readonly LarkDirectoryUser[],
  appId: string | null | undefined,
  openId: string | null | undefined,
): LarkDirectoryUser | null {
  if (!appId || !openId) return null;
  return users.find((user) => user.appId === appId && user.openId === openId) ?? null;
}

export function findLarkDirectoryChat(
  chats: readonly LarkDirectoryChat[],
  appId: string | null | undefined,
  chatId: string | null | undefined,
): LarkDirectoryChat | null {
  if (!appId || !chatId) return null;
  return chats.find((chat) => chat.appId === appId && chat.chatId === chatId) ?? null;
}

export function formatLarkUserOpenId(
  users: readonly LarkDirectoryUser[],
  appId: string | null | undefined,
  openId: string,
  fallbackDisplayName?: string | null,
): string {
  const relation = findLarkDirectoryUser(users, appId, openId);
  if (relation) return formatLarkUserLabel(relation);
  return formatLarkUserIdentity({ displayName: fallbackDisplayName, openId });
}

export function formatLarkChatId(
  chats: readonly LarkDirectoryChat[],
  appId: string | null | undefined,
  chatId: string,
): string {
  const relation = findLarkDirectoryChat(chats, appId, chatId);
  return relation ? formatLarkChatLabel(relation) : chatId;
}
