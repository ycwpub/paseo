import type { AlertTroubleshooterTaskStatus } from "@getpaseo/protocol/messages";
import type pino from "pino";

const NON_TERMINAL_STATUSES = new Set<AlertTroubleshooterTaskStatus>([
  "queued",
  "running",
  "paused",
]);

export async function archiveAlertTroubleshooterAgents(input: {
  enabled: boolean;
  status: AlertTroubleshooterTaskStatus | null;
  agentIds: ReadonlySet<string>;
  archiveAgent?: (agentId: string) => Promise<void>;
  logger: pino.Logger;
  queueItemId: string;
}): Promise<void> {
  if (
    !input.enabled ||
    !input.archiveAgent ||
    !input.status ||
    NON_TERMINAL_STATUSES.has(input.status) ||
    input.agentIds.size === 0
  ) {
    return;
  }

  const agentIds = [...input.agentIds];
  const results = await Promise.allSettled(agentIds.map((agentId) => input.archiveAgent!(agentId)));
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    input.logger.warn(
      {
        err: result.reason,
        agentId: agentIds[index],
        queueItemId: input.queueItemId,
      },
      "Failed to auto-archive alert troubleshooting agent",
    );
  });
}
