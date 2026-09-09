import { describe, expect, it } from "vitest";
import { collectAlertTroubleshooterRecordPages } from "./alert-troubleshooter-record-pagination.js";

describe("collectAlertTroubleshooterRecordPages", () => {
  it("collects every page and forwards the page token", async () => {
    const tokens: Array<string | undefined> = [];
    const items = await collectAlertTroubleshooterRecordPages({
      fetchPage: async (pageToken) => {
        tokens.push(pageToken);
        return pageToken
          ? { items: [3], has_more: false }
          : { items: [1, 2], has_more: true, page_token: "next" };
      },
    });

    expect(items).toEqual([1, 2, 3]);
    expect(tokens).toEqual([undefined, "next"]);
  });

  it("can stop after enough eligible records have been collected", async () => {
    const tokens: Array<string | undefined> = [];
    const items = await collectAlertTroubleshooterRecordPages({
      fetchPage: async (pageToken) => {
        tokens.push(pageToken);
        return { items: pageToken ? [3, 4] : [1, 2], has_more: true, page_token: "next" };
      },
      shouldStop: (records) => records.length >= 2,
    });

    expect(items).toEqual([1, 2]);
    expect(tokens).toEqual([undefined]);
  });

  it("rejects a repeated page token instead of looping forever", async () => {
    await expect(
      collectAlertTroubleshooterRecordPages({
        fetchPage: async () => ({ items: [], has_more: true, page_token: "same" }),
      }),
    ).rejects.toThrow("重复 page_token");
  });

  it("rejects an incomplete pagination response instead of silently truncating records", async () => {
    await expect(
      collectAlertTroubleshooterRecordPages({
        fetchPage: async () => ({ items: [1], has_more: true }),
      }),
    ).rejects.toThrow("未返回 page_token");
  });
});
