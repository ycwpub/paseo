import type { LarkSubstituteMode, LarkSubstituteTask } from "@getpaseo/protocol/messages";

export function findReusableLarkSubstituteAgentId(input: {
  mode: LarkSubstituteMode;
  chatId: string;
  tasks: readonly LarkSubstituteTask[];
  isBusy: (agentId: string) => boolean;
}): string | null {
  const modeUpdatedAt = Date.parse(input.mode.updatedAt);
  const candidate = input.tasks
    .filter(
      (task) =>
        task.modeId === input.mode.id &&
        task.chatId === input.chatId &&
        task.agentId &&
        (task.status === "completed" || task.status === "skipped") &&
        (!Number.isFinite(modeUpdatedAt) || Date.parse(task.createdAt) >= modeUpdatedAt),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .find((task) => task.agentId && !input.isBusy(task.agentId));
  return candidate?.agentId ?? null;
}
