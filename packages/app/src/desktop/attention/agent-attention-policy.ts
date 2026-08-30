interface AgentAttentionRoutingInput {
  reason: "finished" | "error" | "permission";
  shouldNotify: boolean;
}

interface DesktopAgentAttentionInput {
  reason: "finished" | "error" | "permission";
  agentId: string;
  focusedAgentId: string | null;
  isAppActivelyVisible: boolean;
}

export function getAgentAttentionRouting(input: AgentAttentionRoutingInput): {
  shouldSignalDesktop: boolean;
  shouldProcessNotification: boolean;
} {
  return {
    // Desktop attention is local and focus-aware, so it must not be suppressed by the
    // server's cross-client notification deduplication flag.
    shouldSignalDesktop: input.reason === "finished",
    shouldProcessNotification: input.shouldNotify,
  };
}

export function getDesktopAgentAttentionDecision(input: DesktopAgentAttentionInput): {
  shouldSignal: boolean;
  allowWhenFocused: boolean;
} {
  const isViewingCompletedAgent =
    input.isAppActivelyVisible && input.focusedAgentId === input.agentId;
  return {
    shouldSignal: input.reason === "finished" && !isViewingCompletedAgent,
    allowWhenFocused: input.isAppActivelyVisible,
  };
}
