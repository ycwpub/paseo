import type { LarkDirectoryChat, LarkDirectoryUser } from "@getpaseo/protocol/messages";

interface LarkUserIdentity {
  displayName?: string | null;
  email?: string | null;
  openId?: string | null;
}

const GENERIC_LARK_DISPLAY_NAMES = new Set(["lark user", "feishu user", "飞书用户"]);

function compactIdentityParts(parts: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(parts.map((part) => part?.trim() ?? "").filter(Boolean)));
}

function formatIdentityParts(parts: readonly (string | null | undefined)[]): string {
  const [primary, ...details] = compactIdentityParts(parts);
  if (!primary) return "";
  return details.length > 0 ? `${primary}（${details.join("，")}）` : primary;
}

export function formatLarkUserIdentity(user: LarkUserIdentity): string {
  const displayName = user.displayName?.trim() ?? "";
  const friendlyDisplayName = GENERIC_LARK_DISPLAY_NAMES.has(displayName.toLocaleLowerCase())
    ? null
    : displayName;
  return formatIdentityParts([friendlyDisplayName, user.email, user.openId]);
}

export function formatLarkUserLabel(user: LarkDirectoryUser): string {
  return formatLarkUserIdentity(user);
}

export function formatLarkChatIdentity(chat: {
  name?: string | null;
  chatId?: string | null;
}): string {
  const name = chat.name?.trim() ?? "";
  const cleanedName = name
    .replace(/[（(](?:(?:群\s*ID|group\s*id|id)\s*[=:：]?\s*)?\d{10,}[）)]/iu, "")
    .trim();
  return formatIdentityParts([cleanedName, chat.chatId]);
}

export function formatLarkChatLabel(chat: LarkDirectoryChat): string {
  return formatLarkChatIdentity(chat);
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
