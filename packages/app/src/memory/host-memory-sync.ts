import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  PaseoMemoryState,
  PaseoMemorySyncSelection,
  PaseoMemorySyncSnapshot,
} from "@getpaseo/protocol/messages";

export interface MemorySyncHost {
  serverId: string;
  label: string;
  client: Pick<DaemonClient, "getMemorySyncSnapshot" | "mergeMemorySyncSnapshot">;
}

export interface MemorySyncDirectionResult {
  sourceServerId: string;
  targetServerId: string;
  sourceDetailCount: number;
  targetDetailCountBefore: number;
  targetDetailCountAfter: number;
  targetMemory: PaseoMemoryState;
}

export interface TwoWayMemorySyncResult {
  firstToSecond: MemorySyncDirectionResult;
  secondToFirst: MemorySyncDirectionResult;
}

async function readSnapshot(
  host: MemorySyncHost,
  selection: PaseoMemorySyncSelection,
): Promise<PaseoMemorySyncSnapshot> {
  const response = await host.client.getMemorySyncSnapshot({ selection });
  if (response.error || !response.snapshot) {
    throw new Error(response.error ?? `Unable to read memory from ${host.label}`);
  }
  if (response.snapshot.sourceHostId !== host.serverId) {
    throw new Error(
      `${host.label} returned memory for a different host (${response.snapshot.sourceHostId})`,
    );
  }
  return response.snapshot;
}

async function mergeSnapshot(input: {
  source: MemorySyncHost;
  target: MemorySyncHost;
  sourceSnapshot: PaseoMemorySyncSnapshot;
  targetSnapshot: PaseoMemorySyncSnapshot;
  selection: PaseoMemorySyncSelection;
}): Promise<MemorySyncDirectionResult> {
  const response = await input.target.client.mergeMemorySyncSnapshot(input.sourceSnapshot);
  if (response.error || !response.memory) {
    throw new Error(response.error ?? `Unable to merge memory into ${input.target.label}`);
  }
  const nextSnapshot = await readSnapshot(input.target, input.selection);
  return {
    sourceServerId: input.source.serverId,
    targetServerId: input.target.serverId,
    sourceDetailCount: input.sourceSnapshot.details.length,
    targetDetailCountBefore: input.targetSnapshot.details.length,
    targetDetailCountAfter: nextSnapshot.details.length,
    targetMemory: response.memory,
  };
}

export async function syncHostMemoryOneWay(input: {
  source: MemorySyncHost;
  target: MemorySyncHost;
  selection: PaseoMemorySyncSelection;
}): Promise<MemorySyncDirectionResult> {
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    readSnapshot(input.source, input.selection),
    readSnapshot(input.target, input.selection),
  ]);
  return mergeSnapshot({ ...input, sourceSnapshot, targetSnapshot });
}

export async function syncHostMemoryTwoWay(input: {
  first: MemorySyncHost;
  second: MemorySyncHost;
  selection: PaseoMemorySyncSelection;
}): Promise<TwoWayMemorySyncResult> {
  // Both snapshots must be captured before either merge. Otherwise the second
  // direction can immediately echo data that was just imported by the first.
  const [firstSnapshot, secondSnapshot] = await Promise.all([
    readSnapshot(input.first, input.selection),
    readSnapshot(input.second, input.selection),
  ]);
  const [firstToSecond, secondToFirst] = await Promise.allSettled([
    mergeSnapshot({
      source: input.first,
      target: input.second,
      sourceSnapshot: firstSnapshot,
      targetSnapshot: secondSnapshot,
      selection: input.selection,
    }),
    mergeSnapshot({
      source: input.second,
      target: input.first,
      sourceSnapshot: secondSnapshot,
      targetSnapshot: firstSnapshot,
      selection: input.selection,
    }),
  ]);
  if (firstToSecond.status === "rejected" || secondToFirst.status === "rejected") {
    const failures = [
      firstToSecond.status === "rejected"
        ? `${input.first.label} → ${input.second.label}: ${String(firstToSecond.reason)}`
        : null,
      secondToFirst.status === "rejected"
        ? `${input.second.label} → ${input.first.label}: ${String(secondToFirst.reason)}`
        : null,
    ].filter(Boolean);
    const completed =
      Number(firstToSecond.status === "fulfilled") + Number(secondToFirst.status === "fulfilled");
    throw new Error(
      `Two-way memory sync completed ${completed} of 2 directions. ${failures.join(" · ")}`,
    );
  }
  return { firstToSecond: firstToSecond.value, secondToFirst: secondToFirst.value };
}
