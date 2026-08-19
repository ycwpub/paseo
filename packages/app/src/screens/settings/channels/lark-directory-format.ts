import type { LarkDirectoryChat, LarkDirectoryUser } from "@getpaseo/protocol/messages";

export function formatLarkUserLabel(user: LarkDirectoryUser): string {
  const identity = user.email?.trim() || user.displayName?.trim();
  return identity ? `${identity}(${user.openId})` : user.openId;
}

export function formatLarkChatLabel(chat: LarkDirectoryChat): string {
  return `${chat.name}（${chat.groupId}，${chat.chatId}）`;
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
  const displayName = fallbackDisplayName?.trim();
  return displayName ? `${displayName}(${openId})` : openId;
}

export function formatLarkChatId(
  chats: readonly LarkDirectoryChat[],
  appId: string | null | undefined,
  chatId: string,
): string {
  const relation = findLarkDirectoryChat(chats, appId, chatId);
  return relation ? formatLarkChatLabel(relation) : chatId;
}
