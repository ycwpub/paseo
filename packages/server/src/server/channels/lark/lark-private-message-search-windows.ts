import type { LarkUserMessageSearchOptions } from "./lark-client-adapter.js";

const MAX_PRIVATE_MESSAGE_SEARCH_WINDOWS = 32;
const MIN_PRIVATE_MESSAGE_SEARCH_WINDOW_SECONDS = 30 * 60;

export interface LarkPrivateMessageSearchPage {
  items?: readonly string[];
  pageToken?: string;
  hasMore?: boolean;
}

export interface LarkPrivateMessageSearchPageOptions extends LarkUserMessageSearchOptions {
  pageToken?: string;
}

export function buildLarkPrivateMessageSearchWindows(
  options: LarkUserMessageSearchOptions,
): LarkUserMessageSearchOptions[] {
  const startTime = Math.floor(options.startTime);
  const endTime = Math.floor(options.endTime);
  if (endTime <= startTime) {
    return [{ startTime, endTime }];
  }
  const durationSeconds = endTime - startTime + 1;
  const windowSeconds = Math.max(
    MIN_PRIVATE_MESSAGE_SEARCH_WINDOW_SECONDS,
    Math.ceil(durationSeconds / MAX_PRIVATE_MESSAGE_SEARCH_WINDOWS),
  );
  const windows: LarkUserMessageSearchOptions[] = [];
  let cursor = startTime;
  while (cursor <= endTime) {
    const windowEnd = Math.min(endTime, cursor + windowSeconds - 1);
    windows.push({ startTime: cursor, endTime: windowEnd });
    cursor = windowEnd + 1;
  }
  return windows;
}

export async function collectLarkPrivateMessageIds(
  options: LarkUserMessageSearchOptions,
  searchPage: (
    options: LarkPrivateMessageSearchPageOptions,
  ) => Promise<LarkPrivateMessageSearchPage>,
  onRepeatedPageToken?: (options: LarkUserMessageSearchOptions) => void,
): Promise<{ messageIds: string[]; searchWindowCount: number }> {
  const messageIds = new Set<string>();
  const searchWindows = buildLarkPrivateMessageSearchWindows(options);
  for (const searchWindow of searchWindows) {
    let pageToken: string | undefined;
    const visitedPageTokens = new Set<string>();
    do {
      const page = await searchPage({
        ...searchWindow,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const item of page.items ?? []) {
        const messageId = item.trim();
        if (messageId) messageIds.add(messageId);
      }
      const nextPageToken = page.pageToken?.trim() || undefined;
      if (!nextPageToken || page.hasMore === false) {
        pageToken = undefined;
        continue;
      }
      if (visitedPageTokens.has(nextPageToken)) {
        onRepeatedPageToken?.(searchWindow);
        pageToken = undefined;
        continue;
      }
      visitedPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
  }
  return {
    messageIds: [...messageIds],
    searchWindowCount: searchWindows.length,
  };
}
