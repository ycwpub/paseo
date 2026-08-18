import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import {
  filterMemoryDetails,
  parseMemoryImportance,
  parseMemoryValidUntil,
} from "./memory-view-model";

function detail(overrides: Partial<PaseoMemoryDetail> = {}): PaseoMemoryDetail {
  return {
    id: "memory-1",
    title: "Build workflow",
    category: "procedure",
    keywords: ["build", "restart"],
    path: "/tmp/memory-1.md",
    charCount: 20,
    content: "Build before restart.",
    confidence: 1,
    sourceAgentIds: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    lastAccessedAt: null,
    status: "active",
    scope: { type: "project", id: "project-1" },
    ...overrides,
  };
}

describe("memory settings view model", () => {
  test("filters by text, status, and scope", () => {
    const details = [
      detail(),
      detail({
        id: "memory-2",
        title: "Answer style",
        category: "preference",
        content: "Use Chinese.",
        keywords: ["Chinese"],
        scope: { type: "global" },
      }),
      detail({ id: "memory-3", status: "disputed" }),
    ];

    expect(
      filterMemoryDetails({
        details,
        search: "restart",
        status: "active",
        scope: "project",
        now: new Date("2026-08-18T00:00:00.000Z").getTime(),
      }).map((entry) => entry.id),
    ).toEqual(["memory-1"]);
  });

  test("validates importance and validity values before mutation", () => {
    expect(parseMemoryImportance("0.75")).toBe(0.75);
    expect(() => parseMemoryImportance("2")).toThrow("Importance must be a number from 0 to 1");
    expect(parseMemoryValidUntil("")).toBeNull();
    expect(parseMemoryValidUntil("2027-01-01")).toBe("2027-01-01T00:00:00.000Z");
    expect(() => parseMemoryValidUntil("not-a-date")).toThrow(
      "Valid until must be an ISO date or date-time",
    );
  });
});
