import type { BottomAnchorRouteRequest } from "@/agent-stream/bottom-anchor-controller";

export interface AgentRouteBottomAnchorIntent {
  activationRevision: number;
  reason: BottomAnchorRouteRequest["reason"];
  routeKey: string;
}

export interface AgentRouteBottomAnchorLifecycleState {
  activationRevision: number;
  intent: AgentRouteBottomAnchorIntent | null;
  routeKey: string | null;
  wasVisible: boolean;
}

export function reconcileAgentRouteBottomAnchorLifecycle(input: {
  current: AgentRouteBottomAnchorLifecycleState | null;
  routeKey: string | null;
  isVisible: boolean;
  hasAppliedAuthoritativeHistory: boolean;
}): AgentRouteBottomAnchorLifecycleState {
  if (!input.routeKey) {
    return {
      activationRevision: input.current?.activationRevision ?? 0,
      intent: null,
      routeKey: null,
      wasVisible: input.isVisible,
    };
  }

  const current = input.current;
  if (!current || current.routeKey !== input.routeKey) {
    const activationRevision = (current?.activationRevision ?? 0) + 1;
    return {
      activationRevision,
      intent: input.isVisible
        ? {
            activationRevision,
            routeKey: input.routeKey,
            reason: input.hasAppliedAuthoritativeHistory ? "resume" : "initial-entry",
          }
        : null,
      routeKey: input.routeKey,
      wasVisible: input.isVisible,
    };
  }

  if (!input.isVisible || current.wasVisible) {
    return {
      ...current,
      wasVisible: input.isVisible,
    };
  }

  const activationRevision = current.activationRevision + 1;
  const reason =
    current.intent || input.hasAppliedAuthoritativeHistory ? "resume" : "initial-entry";
  return {
    activationRevision,
    intent: {
      activationRevision,
      routeKey: input.routeKey,
      reason,
    },
    routeKey: input.routeKey,
    wasVisible: true,
  };
}

export function deriveAgentRouteBottomAnchorRequest(input: {
  lifecycle: AgentRouteBottomAnchorLifecycleState;
  effectiveAgentId: string | null;
}): BottomAnchorRouteRequest | null {
  if (!input.lifecycle.intent || !input.effectiveAgentId) {
    return null;
  }
  return {
    reason: input.lifecycle.intent.reason,
    agentId: input.effectiveAgentId,
    requestKey: `${input.lifecycle.intent.routeKey}:${input.lifecycle.intent.reason}:activation-${input.lifecycle.intent.activationRevision}`,
  };
}
