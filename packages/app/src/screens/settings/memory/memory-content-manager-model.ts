import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import type { MemoryScopeEntity } from "./memory-scope-policy-options";

export interface MemoryContentTargetOption extends MemoryScopeEntity {
  scope: PaseoMemoryScope;
  memoryCount: number;
}

export type MemoryContentTargetOptions = Record<
  Exclude<PaseoMemoryScope["type"], "global">,
  MemoryContentTargetOption[]
>;

type ManagedEntityType = Exclude<PaseoMemoryScope["type"], "global">;

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
    if (detail.scope?.type !== input.type || !detail.scope.id) continue;
    const existing = options.get(detail.scope.id);
    options.set(detail.scope.id, {
      id: detail.scope.id,
      label: existing?.label ?? detail.scope.id,
      ...(existing?.description ? { description: existing.description } : {}),
      scope: { type: input.type, id: detail.scope.id },
      memoryCount: (existing?.memoryCount ?? 0) + 1,
    });
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
  workspaces: readonly MemoryScopeEntity[];
  assistants: readonly MemoryScopeEntity[];
  details: readonly PaseoMemoryDetail[];
}): MemoryContentTargetOptions {
  return {
    project: buildTargetOptions({
      type: "project",
      entities: input.projects,
      details: input.details,
    }),
    workspace: buildTargetOptions({
      type: "workspace",
      entities: input.workspaces,
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
  const detailType = detail.scope?.type ?? "global";
  if (detailType !== scope.type) return false;
  if (scope.type === "global") {
    return !scope.id || !detail.scope?.id || detail.scope.id === scope.id;
  }
  return detail.scope?.id === scope.id;
}
