import type pino from "pino";
import type { AgentManager } from "../../agent/agent-manager.js";
import type { AgentStorage } from "../../agent/agent-storage.js";
import { archiveAgentCommand } from "../../agent/lifecycle-command.js";
import type { LarkSubstituteModeStore } from "./lark-substitute-mode-store.js";
import type { LarkSubstituteTaskStore } from "./lark-substitute-task-store.js";

export async function archiveLarkSubstituteAgentForTask(input: {
  taskId: string | null;
  agentId: string;
  modeStore: LarkSubstituteModeStore;
  taskStore: LarkSubstituteTaskStore;
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  logger: pino.Logger;
}): Promise<void> {
  if (!input.taskId) return;
  const task = input.taskStore.get(input.taskId);
  if (!task) return;
  const mode = input.modeStore.get(task.modeId);
  if (mode?.autoArchiveAgent !== true) return;

  try {
    await archiveAgentCommand(
      {
        agentManager: input.agentManager,
        agentStorage: input.agentStorage,
        logger: input.logger,
      },
      input.agentId,
    );
  } catch (error) {
    input.logger.warn(
      {
        err: error,
        agentId: input.agentId,
        modeId: task.modeId,
        substituteTaskId: input.taskId,
      },
      "Failed to auto-archive Lark substitute agent",
    );
  }
}
