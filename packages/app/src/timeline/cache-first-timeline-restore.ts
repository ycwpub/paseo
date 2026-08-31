import { getSendingClientMessageIds } from "@/composer/submission/model";
import type { CachedTimeline } from "@/runtime/replica-cache";
import { selectAgentTimelineState, useSessionStore } from "@/stores/session-store";
import { replaceWithCanonicalStream } from "@/types/stream";

export interface CachedTimelineRestoreStorage {
  readTimeline(serverId: string, agentId: string): Promise<CachedTimeline | undefined>;
}

export async function restoreCachedTimelineFirst(input: {
  serverId: string;
  agentId: string;
  storage: CachedTimelineRestoreStorage;
  prepareAgent: (agentId: string) => Promise<void>;
}): Promise<CachedTimeline | undefined> {
  const before = useSessionStore.getState().sessions[input.serverId];
  const beforeTimeline = selectAgentTimelineState(before, input.agentId);
  if (beforeTimeline.status === "synced") return undefined;
  const beforeHead = before?.agentStreamHead.get(input.agentId);

  // Agent/workspace metadata and the timeline are independent cached rows. Start
  // both reads together, and paint the timeline as soon as it is available instead
  // of making the conversation wait behind route metadata restoration.
  const agentPreparation = input.prepareAgent(input.agentId);
  const timelinePreparation = input.storage
    .readTimeline(input.serverId, input.agentId)
    .then((stored) => {
      if (!stored) return undefined;
      const session = useSessionStore.getState().sessions[input.serverId];
      const currentTimeline = selectAgentTimelineState(session, input.agentId);
      const currentHead = session?.agentStreamHead.get(input.agentId);
      if (currentTimeline.status === "synced") return undefined;
      if (!stored.range) {
        if (currentHead !== beforeHead) return undefined;
        if (beforeTimeline.status === "painted") {
          return currentTimeline.status === "painted" &&
            currentTimeline.items === beforeTimeline.items
            ? stored
            : undefined;
        }
        if (currentTimeline.status !== "cold") return undefined;
      }
      const liveItems =
        currentTimeline.status === "painted"
          ? [...currentTimeline.items, ...(currentHead ?? [])]
          : (currentHead ?? []);
      const replacement = stored.range
        ? replaceWithCanonicalStream({
            canonical: stored.items,
            previousTail: [],
            previousHead: liveItems,
            sendingClientMessageIds: getSendingClientMessageIds(
              session?.messageSubmissions.get(input.agentId),
            ),
            preserveContinuity: true,
            canonicalCoverage: stored.range,
          })
        : {
            tail: stored.items,
            head: liveItems,
            acknowledgedClientMessageIds: [],
          };
      useSessionStore.getState().applyAgentTimelineResponseState(input.serverId, input.agentId, {
        items: replacement.tail,
        head: replacement.head,
        range: stored.range,
        older: stored.hasOlder ? "available" : "none",
        newer: false,
        synchronized: false,
        acknowledgedClientMessageIds: replacement.acknowledgedClientMessageIds,
      });
      return stored;
    });

  const [stored] = await Promise.all([timelinePreparation, agentPreparation]);
  return stored;
}
