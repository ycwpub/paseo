import type { PaseoMemoryScope, PaseoMemoryScopePolicy } from "@getpaseo/protocol/messages";

export interface MemoryScopeEntity {
  id: string;
  label: string;
  description?: string;
}

export interface MemoryScopePolicyOption {
  scope: PaseoMemoryScope;
  label: string;
  description?: string;
}

export type MemoryScopePolicyOptions = Record<
  Exclude<PaseoMemoryScope["type"], "global">,
  MemoryScopePolicyOption[]
>;

function mergeScopeOptions(input: {
  type: Exclude<PaseoMemoryScope["type"], "global">;
  entities: readonly MemoryScopeEntity[];
  policies: readonly PaseoMemoryScopePolicy[];
}): MemoryScopePolicyOption[] {
  const options = new Map<string, MemoryScopePolicyOption>();
  for (const entity of input.entities) {
    options.set(entity.id, {
      scope: { type: input.type, id: entity.id },
      label: entity.label || entity.id,
      ...(entity.description ? { description: entity.description } : {}),
    });
  }
  for (const policy of input.policies) {
    if (policy.scope.type !== input.type || !policy.scope.id) continue;
    if (!options.has(policy.scope.id)) {
      options.set(policy.scope.id, {
        scope: { type: input.type, id: policy.scope.id },
        label: policy.scope.id,
      });
    }
  }
  return [...options.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label, undefined, {
        numeric: true,
        sensitivity: "base",
      }) || (left.scope.id ?? "").localeCompare(right.scope.id ?? ""),
  );
}

export function buildMemoryScopePolicyOptions(input: {
  projects: readonly MemoryScopeEntity[];
  workspaces: readonly MemoryScopeEntity[];
  assistants: readonly MemoryScopeEntity[];
  policies: readonly PaseoMemoryScopePolicy[];
}): MemoryScopePolicyOptions {
  return {
    project: mergeScopeOptions({
      type: "project",
      entities: input.projects,
      policies: input.policies,
    }),
    workspace: mergeScopeOptions({
      type: "workspace",
      entities: input.workspaces,
      policies: input.policies,
    }),
    assistant: mergeScopeOptions({
      type: "assistant",
      entities: input.assistants,
      policies: input.policies,
    }),
  };
}
