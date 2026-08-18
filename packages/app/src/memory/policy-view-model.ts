import type {
  PaseoMemoryPolicy,
  PaseoMemoryPolicyTarget,
  PaseoMemoryScope,
  PaseoMemoryScopePolicy,
  PaseoMemoryState,
} from "@getpaseo/protocol/messages";

export interface MemoryPolicyDraft {
  enabled: boolean;
  extractionInstructions: string;
}

function scopeKey(scope: PaseoMemoryScope): string {
  return scope.type === "global" ? "global" : `${scope.type}:${scope.id ?? ""}`;
}

function targetKey(target: PaseoMemoryPolicyTarget): string {
  return `${target.type}:${target.id}`;
}

export function findPolicy(
  policies: readonly PaseoMemoryPolicy[],
  target: PaseoMemoryPolicyTarget,
): PaseoMemoryPolicy | null {
  const key = targetKey(target);
  return policies.find((policy) => targetKey(policy.target) === key) ?? null;
}

export function memoryPolicies(memory: PaseoMemoryState | null): readonly PaseoMemoryPolicy[] {
  // COMPAT(memoryPolicies): added in v0.3.2, remove fallback after 2027-02-18.
  return memory?.policies ?? [];
}

export function memoryPolicyDraft(
  memory: PaseoMemoryState | null,
  target: PaseoMemoryPolicyTarget,
): MemoryPolicyDraft {
  const policy = findPolicy(memoryPolicies(memory), target);
  return {
    enabled: policy?.enabled ?? true,
    extractionInstructions: policy?.extractionInstructions ?? "",
  };
}

export function memoryScopePolicies(
  memory: PaseoMemoryState | null,
): readonly PaseoMemoryScopePolicy[] {
  // COMPAT(memoryScopePolicies): added in v0.3.2, remove fallback after 2027-02-18.
  return memory?.scopePolicies ?? [];
}

export function findScopePolicy(
  policies: readonly PaseoMemoryScopePolicy[],
  scope: PaseoMemoryScope,
): PaseoMemoryScopePolicy | null {
  const key = scopeKey(scope);
  return policies.find((policy) => scopeKey(policy.scope) === key) ?? null;
}

export function memoryScopePolicyDraft(
  memory: PaseoMemoryState | null,
  scope: PaseoMemoryScope,
): MemoryPolicyDraft {
  const policy = findScopePolicy(memoryScopePolicies(memory), scope);
  if (policy) {
    return {
      enabled: policy.enabled,
      extractionInstructions: policy.extractionInstructions,
    };
  }
  // COMPAT(memoryScopePolicies): preserve Project policy drafts saved by the first policy protocol.
  const legacyProjectPolicy =
    scope.type === "project" && scope.id
      ? findPolicy(memoryPolicies(memory), { type: "project", id: scope.id })
      : null;
  return {
    enabled: legacyProjectPolicy?.enabled ?? true,
    extractionInstructions: legacyProjectPolicy?.extractionInstructions ?? "",
  };
}
