import {
  defaultBambooAgentOrchestratorDependencies,
  type BambooAgentOrchestratorDependencies,
} from "./bamboo-agent-orchestrator.js";

export function resolveBambooAgentOrchestratorDependencies(input: {
  overrides?: Partial<BambooAgentOrchestratorDependencies>;
  publishDocument?: BambooAgentOrchestratorDependencies["publishDocument"];
}): BambooAgentOrchestratorDependencies {
  return {
    ...defaultBambooAgentOrchestratorDependencies,
    ...input.overrides,
    ...(input.publishDocument ? { publishDocument: input.publishDocument } : {}),
  };
}
