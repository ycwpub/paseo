export interface LarkChatSearchItem {
  id?: string | null;
  display_info?: string | null;
  meta_data?: {
    chat_id?: string | null;
    name?: string | null;
  } | null;
}

export interface LarkChatSearchResult {
  groupId: string;
  chatId: string;
  name: string;
}

export interface LegacyLarkChatSearchItem {
  chat_id?: string | null;
  name?: string | null;
}

export function mapLarkChatSearchResults(
  items: readonly LarkChatSearchItem[],
): LarkChatSearchResult[] {
  return items.flatMap((item) => {
    const chatId = item.meta_data?.chat_id?.trim() ?? "";
    if (!chatId) return [];
    return [
      {
        groupId: item.id?.trim() || chatId,
        chatId,
        name: item.meta_data?.name?.trim() || item.display_info?.trim() || chatId,
      },
    ];
  });
}

export function mapLegacyLarkChatSearchResults(
  items: readonly LegacyLarkChatSearchItem[],
): LarkChatSearchResult[] {
  return items.flatMap((item) => {
    const chatId = item.chat_id?.trim() ?? "";
    if (!chatId) return [];
    return [
      {
        groupId: chatId,
        chatId,
        name: item.name?.trim() || chatId,
      },
    ];
  });
}

export function findLarkGroupIdByChatId(
  items: readonly LarkChatSearchItem[],
  chatId: string,
): string | null {
  return mapLarkChatSearchResults(items).find((chat) => chat.chatId === chatId)?.groupId ?? null;
}
