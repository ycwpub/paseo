import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { ReplicaCache } from ".";
import type { ReplicaHostRows, ReplicaRow, ReplicaRowChanges, ReplicaRowStore } from "./row-store";
const SERVER_ID = "cached-host";
class MemoryStorage implements ReplicaRowStore {
  readonly rows = new Map<string, ReplicaRow>();
  readonly changes: ReplicaRowChanges[] = [];
  readonly reads: Array<{
    serverId: string;
    kinds: readonly ReplicaRow["kind"][];
    ids?: readonly string[];
  }> = [];
  writes = 0;
  cleanups = 0;
  nextWriteFailure: Error | null = null;
  readGate: Promise<void> | null = null;
  onRead: (() => void) | null = null;
  private key(row: Pick<ReplicaRow, "serverId" | "kind" | "id">): string {
    return `${row.serverId}:${row.kind}:${row.id}`;
  }
  async open(): Promise<void> {}
  async read(
    serverId: string,
    kinds: readonly ReplicaRow["kind"][],
    ids?: readonly string[],
  ): Promise<ReplicaRow[]> {
    this.reads.push({ serverId, kinds, ...(ids ? { ids } : {}) });
    this.onRead?.();
    await this.readGate;
    const acceptedKinds = new Set(kinds);
    const acceptedIds = ids ? new Set(ids) : null;
    return [...this.rows.values()].filter(
      (row) =>
        row.serverId === serverId &&
        acceptedKinds.has(row.kind) &&
        (!acceptedIds || acceptedIds.has(row.id)),
    );
  }
  async readAll(): Promise<ReplicaHostRows[]> {
    const hosts = new Map<string, ReplicaRow[]>();
    for (const row of this.rows.values()) {
      const rows = hosts.get(row.serverId) ?? [];
      rows.push(row);
      hosts.set(row.serverId, rows);
    }
    return [...hosts].map(([serverId, rows]) => ({ serverId, rows }));
  }
  async apply(changes: ReplicaRowChanges): Promise<void> {
    this.writes += 1;
    if (this.nextWriteFailure) {
      const error = this.nextWriteFailure;
      this.nextWriteFailure = null;
      throw error;
    }
    this.changes.push(changes);
    for (const key of changes.deletes) this.rows.delete(this.key(key));
    for (const row of changes.upserts) this.rows.set(this.key(row), row);
  }
  async deleteHost(serverId: string): Promise<void> {
    for (const [key, row] of this.rows) if (row.serverId === serverId) this.rows.delete(key);
  }
  async renameHost(oldServerId: string, newServerId: string): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.serverId !== oldServerId) continue;
      this.rows.delete(key);
      const renamed = { ...row, serverId: newServerId };
      this.rows.set(this.key(renamed), renamed);
    }
  }
  async clear(): Promise<void> {
    this.rows.clear();
  }
}
const noLegacyCleanup = { clearLegacyCache: async () => undefined };
function createCache(storage: MemoryStorage, maxBytes?: number): ReplicaCache {
  const cache = new ReplicaCache(storage, {
    ...noLegacyCleanup,
    ...(maxBytes ? { maxBytes } : {}),
  });
  cache.setHosts([SERVER_ID]);
  return cache;
}
describe("ReplicaCache", () => {
  it("retains a complete tool-heavy turn with authoritative older-history coverage", async () => {
    const storage = new MemoryStorage();
    const writer = createCache(storage);
    const startedAt = new Date("2026-07-18T08:02:00.000Z");
    const completedAt = new Date("2026-07-18T08:03:00.000Z");
    const items: StreamItem[] = [
      ...Array.from(
        { length: 450 },
        (_, index): StreamItem => ({
          kind: "assistant_message",
          id: `old-${index}`,
          text: `Old ${index}`,
          timestamp: startedAt,
          timelineCursor: { epoch: "epoch-1", seq: index + 1 },
        }),
      ),
      {
        kind: "user_message",
        id: "latest-prompt",
        text: "Investigate the issue",
        timestamp: startedAt,
        timelineCursor: { epoch: "epoch-1", seq: 451 },
      },
      {
        kind: "thought",
        id: "latest-thinking",
        source: "thinking",
        text: "Inspecting the repository.",
        timestamp: startedAt,
        startedAt,
        completedAt,
        status: "ready",
        timelineCursor: { epoch: "epoch-1", seq: 452 },
      },
      ...Array.from(
        { length: 97 },
        (_, index): StreamItem => ({
          kind: "tool_call",
          id: `tool-${index}`,
          timestamp: completedAt,
          startedAt,
          completedAt,
          timelineCursor: { epoch: "epoch-1", seq: 453 + index },
          payload: {
            source: "agent",
            data: {
              provider: "codex",
              callId: `call-${index}`,
              name: "exec_command",
              status: "completed",
              error: null,
              detail: {
                type: "unknown",
                input: `echo ${index}`,
                output: `result ${index}`,
              },
            },
          },
        }),
      ),
      {
        kind: "assistant_message",
        id: "latest-answer",
        text: "Completed",
        timestamp: completedAt,
        timelineCursor: { epoch: "epoch-1", seq: 550 },
      },
    ];
    writer.commitTimeline(SERVER_ID, "agent-1", {
      agentId: "agent-1",
      items,
      range: { epoch: "epoch-1", startSeq: 1, endSeq: 550 },
      hasOlder: false,
    });
    await writer.flush();
    const restored = await createCache(storage).readTimeline(SERVER_ID, "agent-1");
    expect(restored?.items[0]).toMatchObject({ kind: "user_message", id: "latest-prompt" });
    expect(restored?.items.filter((item) => item.kind === "tool_call")).toHaveLength(97);
    expect(restored?.items.find((item) => item.kind === "thought")).toMatchObject({
      source: "thinking",
      startedAt,
      completedAt,
    });
    expect(restored?.range).toEqual({ epoch: "epoch-1", startSeq: 451, endSeq: 550 });
    expect(restored?.hasOlder).toBe(true);
  });
});
