import type { LarkDirectoryChat, LarkDirectoryUser } from "@getpaseo/protocol/messages";

export function formatLarkUserLabel(user: LarkDirectoryUser): string {
  const displayName = user.displayName?.trim();
  const email = user.email?.trim();
  if (displayName && email) return `${displayName}（${email}）`;
  if (displayName) return displayName;
  if (email) return email;
  return user.openId;
}

export function formatLarkChatLabel(chat: LarkDirectoryChat): string {
  const name = chat.name.trim();
  const groupId = chat.groupId.trim();
  if (name && groupId) return `${name}（${groupId}）`;
  return name || groupId || chat.chatId;
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
  return fallbackDisplayName?.trim() || openId;
}

export function formatLarkChatId(
  chats: readonly LarkDirectoryChat[],
  appId: string | null | undefined,
  chatId: string,
): string {
  const relation = findLarkDirectoryChat(chats, appId, chatId);
  return relation ? formatLarkChatLabel(relation) : chatId;
}
