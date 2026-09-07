import { describe, expect, test } from "vitest";
import {
  buildLarkPrivateMessageSearchWindows,
  collectLarkPrivateMessageIds,
} from "./lark-private-message-search-windows.js";

describe("buildLarkPrivateMessageSearchWindows", () => {
  test("keeps the default 30-minute scan in one request", () => {
    expect(
      buildLarkPrivateMessageSearchWindows({
        startTime: 1_000,
        endTime: 1_000 + 30 * 60 - 1,
      }),
    ).toEqual([{ startTime: 1_000, endTime: 2_799 }]);
  });

  test("splits a 24-hour scan so active chats cannot crowd older contacts out", () => {
    const startTime = 1_000;
    const endTime = startTime + 24 * 60 * 60 - 1;
    const windows = buildLarkPrivateMessageSearchWindows({ startTime, endTime });

    expect(windows).toHaveLength(32);
    expect(windows[0]?.startTime).toBe(startTime);
    expect(windows.at(-1)?.endTime).toBe(endTime);
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index]?.startTime).toBe((windows[index - 1]?.endTime ?? 0) + 1);
    }
  });

  test("bounds a seven-day scan to at most 32 search windows", () => {
    const windows = buildLarkPrivateMessageSearchWindows({
      startTime: 1_000,
      endTime: 1_000 + 7 * 24 * 60 * 60 - 1,
    });

    expect(windows).toHaveLength(32);
  });

  test("fully paginates every 24-hour search window and deduplicates message IDs", async () => {
    const startTime = 1_000;
    const endTime = startTime + 24 * 60 * 60 - 1;
    const calls: Array<{ startTime: number; endTime: number; pageToken?: string }> = [];

    const result = await collectLarkPrivateMessageIds({ startTime, endTime }, async (options) => {
      calls.push(options);
      if (!options.pageToken) {
        return {
          items: [`om_${options.startTime}`, "om_shared"],
          pageToken: `page_${options.startTime}`,
          hasMore: true,
        };
      }
      return {
        items: [`om_${options.endTime}`, "om_shared"],
        hasMore: false,
      };
    });

    expect(result.searchWindowCount).toBe(32);
    expect(calls).toHaveLength(64);
    expect(result.messageIds).toHaveLength(65);
    expect(result.messageIds.filter((messageId) => messageId === "om_shared")).toHaveLength(1);
  });

  test("stops a broken pagination loop when Lark repeats a page token", async () => {
    const repeatedWindows: Array<{ startTime: number; endTime: number }> = [];
    const calls: string[] = [];

    const result = await collectLarkPrivateMessageIds(
      { startTime: 1_000, endTime: 1_100 },
      async (options) => {
        calls.push(options.pageToken ?? "first");
        return {
          items: [options.pageToken ? "om_second" : "om_first"],
          pageToken: "repeated",
          hasMore: true,
        };
      },
      (window) => repeatedWindows.push(window),
    );

    expect(calls).toEqual(["first", "repeated"]);
    expect(result.messageIds).toEqual(["om_first", "om_second"]);
    expect(repeatedWindows).toEqual([{ startTime: 1_000, endTime: 1_100 }]);
  });
});
