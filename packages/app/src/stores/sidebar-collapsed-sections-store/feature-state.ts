import type { CollapsedProjectsState } from "./state";

export function setWorkspaceGroupsCollapsed(
  state: CollapsedProjectsState,
  projectKeys: readonly string[],
  statusGroupKeys: readonly string[],
  collapsed: boolean,
): CollapsedProjectsState {
  const collapsedProjectKeys = updateCollapsedKeys(
    state.collapsedProjectKeys,
    projectKeys,
    collapsed,
  );
  const collapsedWorkspaceGroupKeys = updateCollapsedKeys(
    state.collapsedWorkspaceGroupKeys,
    statusGroupKeys,
    collapsed,
  );
  return { ...state, collapsedProjectKeys, collapsedWorkspaceGroupKeys };
}

function updateCollapsedKeys(
  current: ReadonlySet<string>,
  keys: readonly string[],
  collapsed: boolean,
): Set<string> {
  const next = new Set(current);
  for (const key of keys) {
    if (collapsed) {
      next.add(key);
    } else {
      next.delete(key);
    }
  }
  return next;
}
