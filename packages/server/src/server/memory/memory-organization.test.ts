import { describe, expect, test } from "vitest";
import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { LOW_IMPORTANCE_MEMORY_THRESHOLD, planMemoryOrganization } from "./memory-organization.js";

const OLD_TIMESTAMP = "2026-08-25T00:00:00.000Z";
const RECENT_TIMESTAMP = "2026-08-27T00:00:00.000Z";
const CUTOFF = new Date("2026-08-26T00:00:00.000Z").getTime();

function detail(
  id: string,
  input: {
    scope: PaseoMemoryScope;
    content?: string;
    origin?: "automatic" | "explicit";
    importance?: number;
    updatedAt?: string;
    useCount?: number;
    helpfulCount?: number;
  },
): PaseoMemoryDetail {
  return {
    id,
    title: `Memory ${id}`,
    category: "fact",
    keywords: [],
    path: `/tmp/${id}.md`,
    charCount: input.content?.length ?? 12,
    content: input.content ?? `Content ${id}`,
    confidence: 0.8,
    sourceAgentIds: ["agent-1"],
    createdAt: OLD_TIMESTAMP,
    updatedAt: input.updatedAt ?? OLD_TIMESTAMP,
    lastAccessedAt: null,
    scope: input.scope,
    origin: input.origin ?? "automatic",
    status: "active",
    importance: input.importance ?? 0.5,
    sourceRefs: [],
    validFrom: OLD_TIMESTAMP,
    validUntil: null,
    supersedes: [],
    useCount: input.useCount ?? 0,
    helpfulCount: input.helpfulCount ?? 0,
    unhelpfulCount: 0,
    lastUsedAt: null,
    sensitive: false,
    encrypted: false,
  };
}

describe("planMemoryOrganization", () => {
  test("only organizes memories older than 24 hours across all supported scopes", () => {
    const scopes: PaseoMemoryScope[] = [
      { type: "global", id: "user-1" },
      { type: "project", id: "project-1" },
      { type: "assistant", id: "assistant-1" },
    ];
    const memories = scopes.flatMap((scope, index) => [
      detail(`old-${index}`, {
        scope,
        importance: LOW_IMPORTANCE_MEMORY_THRESHOLD,
      }),
      detail(`recent-${index}`, {
        scope,
        importance: LOW_IMPORTANCE_MEMORY_THRESHOLD,
        updatedAt: RECENT_TIMESTAMP,
      }),
    ]);

    const plan = planMemoryOrganization(memories, CUTOFF);

    expect(plan.scanned).toBe(3);
    expect(plan.removeIds).toEqual(["old-0", "old-1", "old-2"]);
    expect(plan.scopeCounts).toEqual({
      global: 1,
      project: 1,
      assistant: 1,
    });
  });

  test("merges exact duplicates inside one scope without crossing scope boundaries", () => {
    const memories = [
      detail("global-automatic", {
        scope: { type: "global", id: "user-1" },
        content: "Prefer concise Chinese.",
      }),
      detail("global-explicit", {
        scope: { type: "global", id: "user-1" },
        content: " Prefer concise Chinese! ",
        origin: "explicit",
      }),
      detail("project-copy", {
        scope: { type: "project", id: "project-1" },
        content: "Prefer concise Chinese.",
      }),
    ];

    const plan = planMemoryOrganization(memories, CUTOFF);

    expect(plan.merges).toEqual([
      {
        survivorId: "global-explicit",
        duplicateIds: ["global-automatic"],
      },
    ]);
    expect(plan.removeIds).toEqual([]);
  });

  test("keeps explicit, used, and helpful low-importance memories", () => {
    const lowImportance = LOW_IMPORTANCE_MEMORY_THRESHOLD;
    const memories = [
      detail("automatic-unused", {
        scope: { type: "assistant", id: "assistant-1" },
        importance: lowImportance,
      }),
      detail("explicit", {
        scope: { type: "assistant", id: "assistant-1" },
        importance: lowImportance,
        origin: "explicit",
      }),
      detail("used", {
        scope: { type: "assistant", id: "assistant-1" },
        importance: lowImportance,
        useCount: 1,
      }),
      detail("helpful", {
        scope: { type: "assistant", id: "assistant-1" },
        importance: lowImportance,
        helpfulCount: 1,
      }),
    ];

    const plan = planMemoryOrganization(memories, CUTOFF);

    expect(plan.removeIds).toEqual(["automatic-unused"]);
    expect(plan.skippedExplicit).toBe(1);
  });
});
