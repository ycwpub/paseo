import {
  createViewedTimelineOwner,
  createViewedTimelineSync,
  type TimelineReplica,
  type ViewedTimelineOwner,
  type ViewedTimelineOwnerPorts,
  type ViewedTimelineSync,
  type ViewedTimelineSyncPorts,
} from "./viewed-timeline-sync";
import type { ProjectedTimelineForwardFetchPlan } from "./timeline-sync-plan";

export const TIMELINE_RESUME_FETCH_PAGE_SIZE = 500;

export interface ResumableViewedTimelineSync extends ViewedTimelineSync {
  requestAgentCatchUp(agentId: string): void;
}

export interface ResumableViewedTimelineOwner
  extends ViewedTimelineOwner, ResumableViewedTimelineSync {}

function normalizeResumeRequest(
  request: ProjectedTimelineForwardFetchPlan,
): ProjectedTimelineForwardFetchPlan {
  return request.direction === "after"
    ? { ...request, limit: TIMELINE_RESUME_FETCH_PAGE_SIZE }
    : {
        direction: "tail",
        limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
        projection: "projected",
      };
}

function addExplicitCatchUp<T extends ViewedTimelineSync>(
  sync: T,
  input: {
    isDemanded: (agentId: string) => boolean;
    readCursor: (agentId: string) => { epoch: string; endSeq: number } | undefined;
    fetchLatestTail: (agentId: string) => Promise<unknown>;
    reportError: (error: unknown) => void;
  },
): T & ResumableViewedTimelineSync {
  return {
    ...sync,
    requestAgentCatchUp(agentId) {
      if (!input.isDemanded(agentId)) return;
      const cursor = input.readCursor(agentId);
      if (cursor) {
        sync.recoverGap(agentId, cursor);
        return;
      }
      void input.fetchLatestTail(agentId).catch(input.reportError);
    },
  };
}

export function createResumableViewedTimelineSync(
  ports: ViewedTimelineSyncPorts,
): ResumableViewedTimelineSync {
  let demandedAgentIds = new Set<string>();
  const sync = createViewedTimelineSync({
    ...ports,
    replaceDemandedAgentIds(agentIds) {
      demandedAgentIds = new Set(agentIds);
      ports.replaceDemandedAgentIds(agentIds);
    },
    fetchPage(agentId, request) {
      return ports.fetchPage(agentId, normalizeResumeRequest(request));
    },
  });
  return addExplicitCatchUp(sync, {
    isDemanded: (agentId) => demandedAgentIds.has(agentId),
    readCursor: ports.readCursor,
    fetchLatestTail: ports.fetchLatestTail,
    reportError: ports.reportError,
  });
}

export function createResumableViewedTimelineOwner(input: {
  serverId: string;
  replica: TimelineReplica;
  replaceDemandedAgentIds: (agentIds: string[]) => void;
  drainQueuedAgentMessage: (agentId: string) => void;
  ports: ViewedTimelineOwnerPorts;
}): ResumableViewedTimelineOwner {
  let demandedAgentIds = new Set<string>();
  const owner = createViewedTimelineOwner({
    ...input,
    replaceDemandedAgentIds(agentIds) {
      demandedAgentIds = new Set(agentIds);
      input.replaceDemandedAgentIds(agentIds);
    },
    ports: {
      ...input.ports,
      fetchPage(agentId, request) {
        return input.ports.fetchPage(agentId, normalizeResumeRequest(request));
      },
    },
  });
  return addExplicitCatchUp(owner, {
    isDemanded: (agentId) => demandedAgentIds.has(agentId),
    readCursor: (agentId) => input.replica.readCursor(agentId) ?? input.ports.readCursor(agentId),
    fetchLatestTail: input.ports.fetchLatestTail,
    reportError: input.ports.reportError,
  });
}
