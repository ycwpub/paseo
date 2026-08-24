import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import type { MemoryScopeEntity } from "./memory-scope-policy-options";
import { memoryDetailHasScope, memoryDetailScopes } from "./memory-multi-scope";

export interface MemoryContentTargetOption extends MemoryScopeEntity {
  scope: PaseoMemoryScope;
  memoryCount: number;
}

export type MemoryContentTargetOptions = Record<
  "project" | "assistant",
  MemoryContentTargetOption[]
>;

type ManagedEntityType = keyof MemoryContentTargetOptions;

function buildTargetOptions(input: {
  type: ManagedEntityType;
  entities: readonly MemoryScopeEntity[];
  details: readonly PaseoMemoryDetail[];
}): MemoryContentTargetOption[] {
  const options = new Map<string, MemoryContentTargetOption>();
  for (const entity of input.entities) {
    options.set(entity.id, {
      ...entity,
      scope: { type: input.type, id: entity.id },
      memoryCount: 0,
    });
  }
  for (const detail of input.details) {
    for (const scope of memoryDetailScopes(detail)) {
      if (scope.type !== input.type || !scope.id) continue;
      const existing = options.get(scope.id);
      options.set(scope.id, {
        id: scope.id,
        label: existing?.label ?? scope.id,
        ...(existing?.description ? { description: existing.description } : {}),
        scope: { type: input.type, id: scope.id },
        memoryCount: (existing?.memoryCount ?? 0) + 1,
      });
    }
  }
  return [...options.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label, undefined, {
        numeric: true,
        sensitivity: "base",
      }) || left.id.localeCompare(right.id),
  );
}

export function buildMemoryContentTargetOptions(input: {
  projects: readonly MemoryScopeEntity[];
  assistants: readonly MemoryScopeEntity[];
  details: readonly PaseoMemoryDetail[];
}): MemoryContentTargetOptions {
  return {
    project: buildTargetOptions({
      type: "project",
      entities: input.projects,
      details: input.details,
    }),
    assistant: buildTargetOptions({
      type: "assistant",
      entities: input.assistants,
      details: input.details,
    }),
  };
}

export function memoryDetailMatchesScope(
  detail: PaseoMemoryDetail,
  scope: PaseoMemoryScope | null,
): boolean {
  if (!scope) return false;
  if (scope.type === "global") {
    return memoryDetailScopes(detail).some(
      (candidate) =>
        candidate.type === "global" && (!scope.id || !candidate.id || candidate.id === scope.id),
    );
  }
  return memoryDetailHasScope(detail, scope);
}
