import { describe, expect, test, vi } from "vitest";
import {
  createResumableViewedTimelineOwner,
  createResumableViewedTimelineSync,
  TIMELINE_RESUME_FETCH_PAGE_SIZE,
} from "./resumable-viewed-timeline-sync";
import type {
  TimelineReplica,
  ViewedTimelineOwnerPorts,
  ViewedTimelineSyncPorts,
} from "./viewed-timeline-sync";

function createPorts(overrides: Partial<ViewedTimelineSyncPorts> = {}): ViewedTimelineSyncPorts {
  return {
    initialDeliveryMode: "legacy",
    prepare: vi.fn(async () => undefined),
    replaceDemandedAgentIds: vi.fn(),
    setSubscription: vi.fn(async () => undefined),
    readCursor: vi.fn(() => undefined),
    fetchPage: vi.fn(async () => ({ hasNewer: false, endCursor: null })),
    fetchLatestTail: vi.fn(async () => ({ hasNewer: false, endCursor: null })),
    reportError: vi.fn(),
    schedule: vi.fn(() => () => undefined),
    ...overrides,
  };
}

describe("resumable viewed timeline sync", () => {
  test("uses the larger resume page size for cursor catch-up", async () => {
    const ports = createPorts({
      readCursor: vi.fn(() => ({ epoch: "cached", endSeq: 42 })),
    });
    const sync = createResumableViewedTimelineSync(ports);

    sync.setConnected(true);
    sync.replaceVisibleAgentIds("workspace", ["agent-a"]);

    await vi.waitFor(() => {
      expect(ports.fetchPage).toHaveBeenCalledWith("agent-a", {
        direction: "after",
        cursor: { epoch: "cached", seq: 42 },
        limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
        projection: "projected",
      });
    });
  });

  test("uses the larger resume page size for tail recovery", async () => {
    const ports = createPorts();
    const sync = createResumableViewedTimelineSync(ports);

    sync.setConnected(true);
    sync.replaceVisibleAgentIds("workspace", ["agent-a"]);

    await vi.waitFor(() => {
      expect(ports.fetchPage).toHaveBeenCalledWith("agent-a", {
        direction: "tail",
        limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
        projection: "projected",
      });
    });
  });

  test("explicitly catches up only demanded agents", async () => {
    const ports = createPorts();
    const sync = createResumableViewedTimelineSync(ports);
    sync.replaceVisibleAgentIds("workspace", ["agent-a"]);

    sync.requestAgentCatchUp("agent-b");
    sync.requestAgentCatchUp("agent-a");

    await vi.waitFor(() => {
      expect(ports.fetchLatestTail).toHaveBeenCalledTimes(1);
      expect(ports.fetchLatestTail).toHaveBeenCalledWith("agent-a");
    });
  });

  test("owner applies the same resume request normalization", async () => {
    const basePorts = createPorts({
      readCursor: vi.fn(() => undefined),
    });
    const ports: ViewedTimelineOwnerPorts = {
      initialDeliveryMode: basePorts.initialDeliveryMode,
      setSubscription: basePorts.setSubscription,
      readCursor: basePorts.readCursor,
      fetchPage: basePorts.fetchPage,
      fetchLatestTail: basePorts.fetchLatestTail,
      reportError: basePorts.reportError,
      schedule: basePorts.schedule,
    };
    const replica: TimelineReplica = {
      prepare: vi.fn(async () => undefined),
      readCursor: vi.fn(() => ({ epoch: "replica", endSeq: 7 })),
      timelineUpdated: vi.fn(),
    };
    const owner = createResumableViewedTimelineOwner({
      serverId: "server-a",
      replica,
      replaceDemandedAgentIds: vi.fn(),
      drainQueuedAgentMessage: vi.fn(),
      ports,
    });

    owner.setConnected(true);
    owner.replaceVisibleAgentIds("workspace", ["agent-a"]);

    await vi.waitFor(() => {
      expect(ports.fetchPage).toHaveBeenCalledWith("agent-a", {
        direction: "after",
        cursor: { epoch: "replica", seq: 7 },
        limit: TIMELINE_RESUME_FETCH_PAGE_SIZE,
        projection: "projected",
      });
    });
  });
});
