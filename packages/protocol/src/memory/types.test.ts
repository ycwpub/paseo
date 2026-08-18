import { describe, expect, test } from "vitest";
import { PaseoMemoryStateSchema, PaseoMemoryUpdateInputSchema } from "./types.js";

describe("memory user protocol", () => {
  test("accepts user-aware memory state", () => {
    const state = PaseoMemoryStateSchema.parse({
      settings: {
        enabled: true,
        autoExtract: true,
        maxInjectedChars: 8_000,
        maxRetrievedDetails: 3,
      },
      users: [
        {
          id: "default",
          name: "默认用户",
          createdAt: "2026-08-19T00:00:00.000Z",
          updatedAt: "2026-08-19T00:00:00.000Z",
        },
      ],
      activeUserId: "default",
      summary: "",
      summaryPath: "/tmp/memory/users/default/summary.md",
      details: [],
      stats: {
        detailCount: 0,
        pendingExtractions: 0,
        lastExtractedAt: null,
        lastExtractionError: null,
      },
    });
    expect(state.activeUserId).toBe("default");
  });

  test("accepts create, select, rename, and delete user operations", () => {
    for (const userOperation of [
      { type: "create", name: "User 2" },
      { type: "select", id: "user-2" },
      { type: "rename", id: "user-2", name: "Renamed" },
      { type: "delete", id: "user-2" },
    ] as const) {
      expect(PaseoMemoryUpdateInputSchema.parse({ userOperation }).userOperation).toEqual(
        userOperation,
      );
    }
  });
});
