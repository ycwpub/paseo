import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { planTimelineTailFetch } from "./resume-sync-plan";

interface TimelineReplacementFetch {
  fetchAgentTimeline: DaemonClient["fetchAgentTimeline"];
}

export function requestResumeTimelineReplacement(
  client: TimelineReplacementFetch,
  agentId: string,
): ReturnType<DaemonClient["fetchAgentTimeline"]> {
  return client.fetchAgentTimeline(agentId, planTimelineTailFetch());
}
