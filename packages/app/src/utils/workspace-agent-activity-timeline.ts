import type { Agent } from "@/stores/session-store";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import {
  buildWorkspaceAgentActivityIndex,
  type WorkspaceAgentActivity,
} from "./workspace-agent-activity";

export interface WorkspaceAgentTimelineActivity extends WorkspaceAgentActivity {
  activityAt?: Date;
}

// oxlint-disable-next-line complexity -- Reconciles root-agent selection, activity timestamps, and referential stability in one pass.
export function buildWorkspaceAgentActivityTimelineIndex(
  agents: ReadonlyMap<string, Agent>,
  previous?: ReadonlyMap<string, WorkspaceAgentTimelineActivity>,
): Map<string, WorkspaceAgentTimelineActivity> {
  const latestRootAgentByWorkspaceId = new Map<string, Agent>();
  const latestActivityAtByWorkspaceId = new Map<string, Date>();

  for (const agent of agents.values()) {
    const parentAgent = agent.parentAgentId ? agents.get(agent.parentAgentId) : undefined;
    if (agent.archivedAt || !agent.workspaceId || !isWorkspaceRootAgent(agent, parentAgent)) {
      continue;
    }

    const activityAt =
      agent.attentionTimestamp && agent.attentionTimestamp > agent.lastActivityAt
        ? agent.attentionTimestamp
        : agent.lastActivityAt;
    const latestActivityAt = latestActivityAtByWorkspaceId.get(agent.workspaceId);
    if (latestActivityAt && activityAt <= latestActivityAt) {
      continue;
    }
    latestRootAgentByWorkspaceId.set(agent.workspaceId, agent);
    latestActivityAtByWorkspaceId.set(agent.workspaceId, activityAt);
  }

  const selectedAgents = new Map(
    [...latestRootAgentByWorkspaceId.values()].map((agent) => [agent.id, agent]),
  );
  const baseActivities = buildWorkspaceAgentActivityIndex(selectedAgents);
  const activities = new Map<string, WorkspaceAgentTimelineActivity>();

  for (const [workspaceId, activity] of baseActivities) {
    const activityAt = latestActivityAtByWorkspaceId.get(workspaceId);
    if (!activityAt) {
      continue;
    }
    const previousActivity = previous?.get(workspaceId);
    if (
      previousActivity?.agentId === activity.agentId &&
      previousActivity.status === activity.status
    ) {
      if (previousActivity.activityAt?.getTime() === activityAt.getTime()) {
        activities.set(workspaceId, previousActivity);
      } else {
        activities.set(workspaceId, {
          ...activity,
          enteredAt: previousActivity.enteredAt,
          activityAt,
        });
      }
      continue;
    }
    activities.set(workspaceId, { ...activity, activityAt });
  }

  if (previous && indexesAreIdentical(previous, activities)) {
    return previous instanceof Map ? previous : new Map(previous);
  }
  return activities;
}

function indexesAreIdentical(
  previous: ReadonlyMap<string, WorkspaceAgentTimelineActivity>,
  next: ReadonlyMap<string, WorkspaceAgentTimelineActivity>,
): boolean {
  if (previous.size !== next.size) {
    return false;
  }
  for (const [workspaceId, activity] of next) {
    if (previous.get(workspaceId) !== activity) {
      return false;
    }
  }
  return true;
}
