import { describe, expect, test, vi } from "vitest";
import type { PaseoMemoryState, PaseoMemorySyncSnapshot } from "@getpaseo/protocol/messages";
import {
  syncHostMemoryOneWay,
  syncHostMemoryTwoWay,
  type MemorySyncHost,
} from "./host-memory-sync";

function snapshot(sourceHostId: string, detailIds: string[]): PaseoMemorySyncSnapshot {
  return {
    version: 1,
    sourceHostId,
    exportedAt: "2026-08-20T00:00:00.000Z",
    users: [
      {
        id: "default",
        name: "默认用户",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    ],
    summaries: [{ userId: "default", content: "# Paseo memory" }],
    details: detailIds.map((id) => ({
      id,
      title: id,
      category: "fact",
      keywords: [],
      content: id,
      confidence: 1,
      sourceAgentIds: ["agent"],
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      lastAccessedAt: null,
      syncOrigin: { hostId: sourceHostId, memoryId: id },
    })),
    policies: [],
    scopePolicies: [],
  };
}

function memory(): PaseoMemoryState {
  return {
    settings: {
      enabled: true,
      autoExtract: true,
      maxInjectedChars: 8_000,
      maxRetrievedDetails: 3,
    },
    summary: "",
    summaryPath: "/tmp/summary.md",
    details: [],
    stats: {
      detailCount: 0,
      pendingExtractions: 0,
      lastExtractedAt: null,
      lastExtractionError: null,
    },
  };
}

function host(serverId: string, snapshots: PaseoMemorySyncSnapshot[]): MemorySyncHost {
  const queue = [...snapshots];
  return {
    serverId,
    label: serverId,
    client: {
      getMemorySyncSnapshot: vi.fn(async () => ({
        requestId: "read",
        snapshot: queue.shift() ?? snapshots.at(-1)!,
        error: null,
      })),
      mergeMemorySyncSnapshot: vi.fn(async () => ({
        requestId: "merge",
        memory: memory(),
        error: null,
      })),
    },
  };
}

describe("host memory sync", () => {
  test("merges a source snapshot into the target host", async () => {
    const source = host("source", [snapshot("source", ["a"])]);
    const target = host("target", [snapshot("target", ["b"]), snapshot("target", ["a", "b"])]);

    const result = await syncHostMemoryOneWay({ source, target });

    expect(target.client.mergeMemorySyncSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ sourceHostId: "source" }),
    );
    expect(result).toMatchObject({
      sourceDetailCount: 1,
      targetDetailCountBefore: 1,
      targetDetailCountAfter: 2,
    });
  });

  test("captures both snapshots before starting either merge", async () => {
    const events: string[] = [];
    const first = host("first", [snapshot("first", ["a"]), snapshot("first", ["a", "b"])]);
    const second = host("second", [snapshot("second", ["b"]), snapshot("second", ["a", "b"])]);
    vi.mocked(first.client.getMemorySyncSnapshot).mockImplementation(async () => {
      events.push("read-first");
      return { requestId: "read-first", snapshot: snapshot("first", ["a"]), error: null };
    });
    vi.mocked(second.client.getMemorySyncSnapshot).mockImplementation(async () => {
      events.push("read-second");
      return { requestId: "read-second", snapshot: snapshot("second", ["b"]), error: null };
    });
    vi.mocked(first.client.mergeMemorySyncSnapshot).mockImplementation(async () => {
      events.push("merge-first");
      return { requestId: "merge-first", memory: memory(), error: null };
    });
    vi.mocked(second.client.mergeMemorySyncSnapshot).mockImplementation(async () => {
      events.push("merge-second");
      return { requestId: "merge-second", memory: memory(), error: null };
    });

    await syncHostMemoryTwoWay({ first, second });

    expect(events.indexOf("merge-first")).toBeGreaterThan(events.indexOf("read-first"));
    expect(events.indexOf("merge-first")).toBeGreaterThan(events.indexOf("read-second"));
    expect(events.indexOf("merge-second")).toBeGreaterThan(events.indexOf("read-first"));
    expect(events.indexOf("merge-second")).toBeGreaterThan(events.indexOf("read-second"));
  });
});
