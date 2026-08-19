import type {
  AgentAttentionNotificationPayload,
  AgentAttentionReason,
} from "@getpaseo/protocol/agent-attention-notification";
import { showDesktopIsland } from "./desktop-island";

export function showAgentAttentionIsland(input: {
  serverId: string;
  agentId: string;
  agentTitle?: string | null;
  reason: AgentAttentionReason;
  notification?: AgentAttentionNotificationPayload | null;
}): void {
  if (!input.notification) {
    return;
  }
  const agentTitle = input.agentTitle?.trim();
  showDesktopIsland({
    id: `${input.serverId}:${input.agentId}`,
    kind: input.reason,
    title: agentTitle || input.notification.title,
    body: agentTitle
      ? `${input.notification.title} · ${input.notification.body}`
      : input.notification.body,
    data: input.notification.data,
  });
}

export function showAgentRunningIsland(input: {
  serverId: string;
  agentId: string;
  agentTitle?: string | null;
  workspaceId?: string;
  body: string;
}): void {
  showDesktopIsland({
    id: `${input.serverId}:${input.agentId}`,
    kind: "running",
    title: input.agentTitle?.trim() || "Paseo Agent",
    body: input.body,
    data: {
      serverId: input.serverId,
      agentId: input.agentId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
  });
}
