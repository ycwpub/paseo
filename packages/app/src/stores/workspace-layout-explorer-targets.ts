import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export const DEFAULT_EXPLORER_TARGETS = [
  { kind: "files" },
  { kind: "changes_tree" },
  { kind: "working_diff" },
  { kind: "task_summary" },
  { kind: "pull_request" },
] as const satisfies readonly WorkspaceTabTarget[];

const DEFAULT_EXPLORER_TARGET_KINDS = new Set<WorkspaceTabTarget["kind"]>(
  DEFAULT_EXPLORER_TARGETS.map((target) => target.kind),
);

export function isDefaultExplorerTarget(target: WorkspaceTabTarget): boolean {
  return DEFAULT_EXPLORER_TARGET_KINDS.has(target.kind);
}
