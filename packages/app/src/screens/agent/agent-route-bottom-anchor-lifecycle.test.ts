import { describe, expect, it } from "vitest";
import {
  deriveAgentRouteBottomAnchorRequest,
  reconcileAgentRouteBottomAnchorLifecycle,
} from "./agent-route-bottom-anchor-lifecycle";

describe("agent route bottom anchor lifecycle", () => {
  it("latches initial-entry on first route entry before authoritative history is applied", () => {
    const lifecycleAtEntry = reconcileAgentRouteBottomAnchorLifecycle({
      current: null,
      routeKey: "server-1:agent-1",
      isVisible: true,
      hasAppliedAuthoritativeHistory: false,
    });

    const lifecycleAfterHistoryApplies = reconcileAgentRouteBottomAnchorLifecycle({
      current: lifecycleAtEntry,
      routeKey: "server-1:agent-1",
      isVisible: true,
      hasAppliedAuthoritativeHistory: true,
    });

    expect(lifecycleAfterHistoryApplies.intent).toEqual({
      activationRevision: 1,
      routeKey: "server-1:agent-1",
      reason: "initial-entry",
    });
    expect(
      deriveAgentRouteBottomAnchorRequest({
        lifecycle: lifecycleAfterHistoryApplies,
        effectiveAgentId: "agent-1",
      }),
    ).toEqual({
      agentId: "agent-1",
      reason: "initial-entry",
      requestKey: "server-1:agent-1:initial-entry:activation-1",
    });
  });

  it("creates resume requests when revisiting an already-hydrated route", () => {
    const lifecycle = reconcileAgentRouteBottomAnchorLifecycle({
      current: null,
      routeKey: "server-1:agent-2",
      isVisible: true,
      hasAppliedAuthoritativeHistory: true,
    });

    expect(
      deriveAgentRouteBottomAnchorRequest({
        lifecycle,
        effectiveAgentId: "agent-2",
      }),
    ).toEqual({
      agentId: "agent-2",
      reason: "resume",
      requestKey: "server-1:agent-2:resume:activation-1",
    });
  });

  it("generates a fresh resume request whenever a retained route becomes visible again", () => {
    const initial = reconcileAgentRouteBottomAnchorLifecycle({
      current: null,
      routeKey: "server-1:agent-3",
      isVisible: true,
      hasAppliedAuthoritativeHistory: true,
    });
    const hidden = reconcileAgentRouteBottomAnchorLifecycle({
      current: initial,
      routeKey: "server-1:agent-3",
      isVisible: false,
      hasAppliedAuthoritativeHistory: true,
    });
    const resumed = reconcileAgentRouteBottomAnchorLifecycle({
      current: hidden,
      routeKey: "server-1:agent-3",
      isVisible: true,
      hasAppliedAuthoritativeHistory: true,
    });

    expect(resumed.intent).toEqual({
      activationRevision: 2,
      routeKey: "server-1:agent-3",
      reason: "resume",
    });
    expect(
      deriveAgentRouteBottomAnchorRequest({
        lifecycle: resumed,
        effectiveAgentId: "agent-3",
      }),
    ).toEqual({
      agentId: "agent-3",
      reason: "resume",
      requestKey: "server-1:agent-3:resume:activation-2",
    });
  });

  it("waits for the first visible activation when a retained route mounts hidden", () => {
    const hidden = reconcileAgentRouteBottomAnchorLifecycle({
      current: null,
      routeKey: "server-1:agent-4",
      isVisible: false,
      hasAppliedAuthoritativeHistory: false,
    });
    expect(
      deriveAgentRouteBottomAnchorRequest({
        lifecycle: hidden,
        effectiveAgentId: "agent-4",
      }),
    ).toBeNull();

    const visible = reconcileAgentRouteBottomAnchorLifecycle({
      current: hidden,
      routeKey: "server-1:agent-4",
      isVisible: true,
      hasAppliedAuthoritativeHistory: true,
    });
    expect(
      deriveAgentRouteBottomAnchorRequest({
        lifecycle: visible,
        effectiveAgentId: "agent-4",
      }),
    ).toEqual({
      agentId: "agent-4",
      reason: "resume",
      requestKey: "server-1:agent-4:resume:activation-2",
    });
  });

  it("does not create a request until the effective agent exists", () => {
    const lifecycle = reconcileAgentRouteBottomAnchorLifecycle({
      current: null,
      routeKey: "server-1:agent-5",
      isVisible: true,
      hasAppliedAuthoritativeHistory: false,
    });

    expect(
      deriveAgentRouteBottomAnchorRequest({
        lifecycle,
        effectiveAgentId: null,
      }),
    ).toBeNull();
  });
});
