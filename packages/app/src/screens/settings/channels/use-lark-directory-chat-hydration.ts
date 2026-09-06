import { useEffect, useMemo, useRef } from "react";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryChat,
} from "@getpaseo/protocol/messages";

export function collectIncompleteLarkChatIds(input: {
  appId: string | null;
  chatIds: readonly string[];
  chats: readonly LarkDirectoryChat[];
}): string[] {
  if (!input.appId) return [];
  const directoryByChatId = new Map(
    input.chats
      .filter((chat) => chat.appId === input.appId)
      .map((chat) => [chat.chatId, chat] as const),
  );
  return Array.from(
    new Set(
      input.chatIds
        .map((chatId) => chatId.trim())
        .filter(Boolean)
        .filter((chatId) => {
          const chat = directoryByChatId.get(chatId);
          return !chat || chat.groupId === chat.chatId || chat.name === chat.chatId;
        }),
    ),
  );
}

function useLarkDirectoryChatHydration(input: {
  active: boolean;
  supported: boolean;
  bot: LarkChannelBotStatus | null;
  directory: LarkDirectory | null;
  resolveChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
}): void {
  const appId = input.bot?.appId ?? null;
  const chatIds = useMemo(
    () => [
      ...(input.bot?.authorizedUsers.map((user) => user.chatId) ?? []),
      ...(input.bot?.pendingPairings.map((pairing) => pairing.chatId) ?? []),
    ],
    [input.bot],
  );
  const chats = input.directory?.chats;
  const enabled = input.active && input.supported;
  const resolveChats = input.resolveChats;
  const attemptedKeysRef = useRef(new Set<string>());
  const incompleteChatIds = useMemo(
    () =>
      collectIncompleteLarkChatIds({
        appId,
        chatIds,
        chats: chats ?? [],
      }),
    [appId, chatIds, chats],
  );

  useEffect(() => {
    if (!enabled || !appId) return;
    for (const chatId of incompleteChatIds) {
      const key = `${appId}:${chatId}`;
      if (attemptedKeysRef.current.has(key)) continue;
      attemptedKeysRef.current.add(key);
      void Promise.resolve(resolveChats(appId, chatId)).catch(() => undefined);
    }
  }, [appId, enabled, incompleteChatIds, resolveChats]);
}

export const useLarkBotDirectoryChatHydration = useLarkDirectoryChatHydration;
