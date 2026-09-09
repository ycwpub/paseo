import {
  defaultBambooAgentOrchestratorDependencies,
  type BambooAgentOrchestratorDependencies,
} from "./bamboo-agent-orchestrator.js";
import type { AlertTroubleshooterRecordStore } from "./alert-troubleshooter-record-store.js";

export function resolveBambooAgentOrchestratorDependencies(input: {
  overrides?: Partial<BambooAgentOrchestratorDependencies>;
  publishDocument?: BambooAgentOrchestratorDependencies["publishDocument"];
  recordStore?: AlertTroubleshooterRecordStore;
}): BambooAgentOrchestratorDependencies {
  return {
    ...defaultBambooAgentOrchestratorDependencies,
    ...(input.recordStore
      ? {
          persistPreparedMetadata: async ({ execution, metadata }) => {
            await input.recordStore?.updateBambooPreparedMetadata?.({
              config: execution.config,
              pluginId: execution.state.pluginId,
              recordId: execution.record.recordId,
              tableDate: execution.record.tableDate,
              alarmRecordDetailId: metadata.alarmRecordDetailId,
              taskId: metadata.taskId,
              ruleId: metadata.ruleId,
              extra: execution.record.extra,
            });
          },
        }
      : {}),
    ...input.overrides,
    ...(input.publishDocument ? { publishDocument: input.publishDocument } : {}),
  };
}
