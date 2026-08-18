import type {
  PaseoMemoryPolicy,
  PaseoMemoryScope,
  PaseoMemoryScopePolicy,
} from "@getpaseo/protocol/messages";
import { findMemoryPolicy } from "./memory-context-policy.js";
import { normalizeMemoryScope } from "./memory-model.js";

export interface ResolvedMemoryScopePolicies {
  scopes: PaseoMemoryScope[];
  extractionInstructions: string[];
}

function requireValidPolicyScope(scope: PaseoMemoryScope): PaseoMemoryScope {
  if (scope.type === "global") return { type: "global" };
  const id = scope.id?.trim();
  if (!id) throw new Error(`${scope.type} memory policy requires an ID`);
  return { type: scope.type, id };
}

function policyScopeKey(scope: PaseoMemoryScope): string {
  return scope.type === "global" ? "global" : `${scope.type}:${scope.id?.trim() ?? ""}`;
}

export function findMemoryScopePolicy(
  policies: readonly PaseoMemoryScopePolicy[],
  scope: PaseoMemoryScope,
): PaseoMemoryScopePolicy | null {
  const key = policyScopeKey(scope);
  return policies.find((policy) => policyScopeKey(policy.scope) === key) ?? null;
}

export function upsertMemoryScopePolicies(
  current: readonly PaseoMemoryScopePolicy[],
  updates: readonly PaseoMemoryScopePolicy[],
): PaseoMemoryScopePolicy[] {
  const next = new Map(current.map((policy) => [policyScopeKey(policy.scope), policy] as const));
  for (const update of updates) {
    const scope = requireValidPolicyScope(update.scope);
    next.set(policyScopeKey(scope), {
      scope,
      enabled: update.enabled,
      extractionInstructions: update.extractionInstructions.trim(),
    });
  }
  return [...next.values()];
}

export function resolveMemoryScopePolicies(input: {
  availableScopes: readonly PaseoMemoryScope[];
  policies: readonly PaseoMemoryScopePolicy[];
  legacyPolicies?: readonly PaseoMemoryPolicy[];
}): ResolvedMemoryScopePolicies {
  const scopes: PaseoMemoryScope[] = [];
  const extractionInstructions: string[] = [];
  const seen = new Set<string>();

  for (const rawScope of input.availableScopes) {
    const scope = normalizeMemoryScope(rawScope);
    const key = policyScopeKey(scope);
    if (seen.has(key)) continue;
    seen.add(key);

    const policy = findMemoryScopePolicy(input.policies, scope);
    const legacyProjectPolicy =
      !policy && scope.type === "project" && scope.id
        ? findMemoryPolicy(input.legacyPolicies ?? [], {
            type: "project",
            id: scope.id,
          })
        : null;
    const enabled = policy?.enabled ?? legacyProjectPolicy?.enabled ?? true;
    if (!enabled) continue;

    scopes.push(scope);
    const instructions = (
      policy?.extractionInstructions ??
      legacyProjectPolicy?.extractionInstructions ??
      ""
    ).trim();
    if (instructions) extractionInstructions.push(`${key}: ${instructions}`);
  }

  return { scopes, extractionInstructions };
}
