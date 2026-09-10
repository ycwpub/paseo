import type { LarkSubstituteMode, LarkSubstituteTask } from "@getpaseo/protocol/messages";
import { resolveLarkTargetProjectId } from "./lark-project-target.js";

const MAX_CONTEXT_TASKS = 20;

export interface LarkSubstituteProjectBinding {
  modeId: string;
  modeName: string;
  botId: string;
  enabled: boolean;
}

export interface LarkSubstituteProjectTaskBinding {
  taskId: string;
  modeId: string;
  status: LarkSubstituteTask["status"];
  source: LarkSubstituteTask["source"];
  agentId: string | null;
}

export function listLarkSubstituteProjectBindings(input: {
  projectId: string;
  paseoHome: string;
  modes: readonly LarkSubstituteMode[];
}): LarkSubstituteProjectBinding[] {
  return input.modes
    .filter((mode) => resolveLarkTargetProjectId(mode.target, input.paseoHome) === input.projectId)
    .map((mode) => ({
      modeId: mode.id,
      modeName: mode.name,
      botId: mode.botId,
      enabled: mode.enabled,
    }))
    .sort(
      (left, right) =>
        left.modeName.localeCompare(right.modeName, "zh-CN") ||
        left.modeId.localeCompare(right.modeId),
    );
}

export function listLarkSubstituteProjectTaskBindings(input: {
  modeIds: ReadonlySet<string>;
  tasks: readonly LarkSubstituteTask[];
  limit?: number;
}): LarkSubstituteProjectTaskBinding[] {
  return input.tasks
    .filter((task) => input.modeIds.has(task.modeId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, input.limit ?? MAX_CONTEXT_TASKS)
    .map((task) => ({
      taskId: task.id,
      modeId: task.modeId,
      status: task.status,
      source: task.source,
      agentId: task.agentId,
    }));
}

export function buildLarkSubstituteProjectAgentContext(input: {
  projectId: string;
  paseoHome: string;
  modes: readonly LarkSubstituteMode[];
  tasks: readonly LarkSubstituteTask[];
}): string | null {
  const bindings = listLarkSubstituteProjectBindings(input);
  if (bindings.length === 0) return null;
  const tasks = listLarkSubstituteProjectTaskBindings({
    modeIds: new Set(bindings.map((binding) => binding.modeId)),
    tasks: input.tasks,
  });

  return [
    "<paseo_lark_substitute_project>",
    `This Project is bound to ${bindings.length} Lark substitute mode(s).`,
    ...bindings.map(
      (binding) =>
        `- ${binding.modeName} (mode_id=${binding.modeId}, bot_id=${binding.botId}, enabled=${binding.enabled})`,
    ),
    tasks.length > 0
      ? `Latest bound substitute tasks (up to ${MAX_CONTEXT_TASKS}):`
      : "No substitute task records have been created for these modes yet.",
    ...tasks.map(
      (task) =>
        `- task_id=${task.taskId}, mode_id=${task.modeId}, status=${task.status}, source=${task.source}, agent_id=${task.agentId ?? "unassigned"}`,
    ),
    "Project capability: Agents created by a bound substitute task can use the lark-substitute-reply Skill and `paseo substitute reply` CLI to send an improved answer back to that task's original Lark topic.",
    "When the user explicitly asks to send, resend, or reply with an improved answer through Lark, produce only the final user-facing answer. Paseo will deliver that completed turn to the bound Lark topic; do not merely claim that it was sent.",
    "The Server resolves the exact substitute task from PASEO_AGENT_ID and verifies the Agent, task, Project, bot, and conversation bindings. Do not set or override PASEO_AGENT_ID manually.",
    "A regular Project Agent may inspect this binding context, but it cannot reply for a substitute task unless that task created the Agent.",
    "</paseo_lark_substitute_project>",
  ].join("\n");
}
