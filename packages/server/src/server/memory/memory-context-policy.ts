import type {
  PaseoMemoryDetail,
  PaseoMemoryPolicy,
  PaseoMemoryPolicyTarget,
  PaseoMemoryScope,
} from "@getpaseo/protocol/messages";
import type { AgentMemoryMode } from "./memory-policy.js";

interface ResolveMemoryContextPolicyInput {
  policies: readonly PaseoMemoryPolicy[];
  agentId: string;
  projectId: string | null;
  configuredMode: AgentMemoryMode;
  sessionMode?: AgentMemoryMode;
}

export interface ResolvedMemoryContextPolicy {
  mode: AgentMemoryMode;
  projectMemoryEnabled: boolean;
  extractionInstructions: string[];
}

export function memoryPolicyTargetKey(target: PaseoMemoryPolicyTarget): string {
  return `${target.type}:${target.id}`;
}

export function findMemoryPolicy(
  policies: readonly PaseoMemoryPolicy[],
  target: PaseoMemoryPolicyTarget,
): PaseoMemoryPolicy | null {
  const targetKey = memoryPolicyTargetKey(target);
  return policies.find((policy) => memoryPolicyTargetKey(policy.target) === targetKey) ?? null;
}

export function upsertMemoryPolicies(
  current: readonly PaseoMemoryPolicy[],
  updates: readonly PaseoMemoryPolicy[],
): PaseoMemoryPolicy[] {
  const next = new Map(current.map((policy) => [memoryPolicyTargetKey(policy.target), policy]));
  for (const policy of updates) {
    next.set(memoryPolicyTargetKey(policy.target), {
      ...policy,
      extractionInstructions: policy.extractionInstructions.trim(),
    });
  }
  return [...next.values()];
}

export function resolveMemoryContextPolicy({
  policies,
  agentId,
  projectId,
  configuredMode,
  sessionMode,
}: ResolveMemoryContextPolicyInput): ResolvedMemoryContextPolicy {
  const conversationPolicy = findMemoryPolicy(policies, {
    type: "conversation",
    id: agentId,
  });
  const projectPolicy = projectId
    ? findMemoryPolicy(policies, { type: "project", id: projectId })
    : null;
  const conversationEnabled = conversationPolicy?.enabled ?? true;
  const mode = sessionMode ?? (conversationEnabled ? configuredMode : "off");
  const projectMemoryEnabled = projectPolicy?.enabled ?? true;
  const extractionInstructions = [
    projectMemoryEnabled ? projectPolicy?.extractionInstructions.trim() : "",
    mode === "on" ? conversationPolicy?.extractionInstructions.trim() : "",
  ].filter((value): value is string => Boolean(value));
  return { mode, projectMemoryEnabled, extractionInstructions };
}

export function canStoreExtractedMemory(input: {
  category: PaseoMemoryDetail["category"];
  requestedScope: PaseoMemoryScope["type"] | undefined;
  scopes: readonly PaseoMemoryScope[];
}): boolean {
  if (input.scopes.length === 0) return false;
  const hasProjectScope = input.scopes.some((scope) => scope.type === "project");
  if (hasProjectScope) return true;
  return input.requestedScope !== "project" && input.category !== "project";
}
