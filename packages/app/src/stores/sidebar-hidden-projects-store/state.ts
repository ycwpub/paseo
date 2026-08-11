export interface HiddenProjectsState {
  hiddenProjectKeys: Set<string>;
  hiddenSectionCollapsed: boolean;
}

export interface PersistedHiddenProjects {
  hiddenProjectKeys?: unknown;
  hiddenSectionCollapsed?: unknown;
}

export function setProjectHidden(
  state: HiddenProjectsState,
  projectKey: string,
  hidden: boolean,
): HiddenProjectsState {
  const next = new Set(state.hiddenProjectKeys);
  if (hidden) {
    next.add(projectKey);
  } else {
    next.delete(projectKey);
  }
  return { ...state, hiddenProjectKeys: next };
}

export function toggleHiddenSection(state: HiddenProjectsState): HiddenProjectsState {
  return { ...state, hiddenSectionCollapsed: !state.hiddenSectionCollapsed };
}

export function serializeHiddenProjects(state: HiddenProjectsState): {
  hiddenProjectKeys: string[];
  hiddenSectionCollapsed: boolean;
} {
  return {
    hiddenProjectKeys: Array.from(state.hiddenProjectKeys),
    hiddenSectionCollapsed: state.hiddenSectionCollapsed,
  };
}

export function mergePersistedHiddenProjects<S extends HiddenProjectsState>(
  persisted: PersistedHiddenProjects | undefined,
  current: S,
): S {
  if (
    persisted?.hiddenProjectKeys === undefined &&
    persisted?.hiddenSectionCollapsed === undefined
  ) {
    return current;
  }

  const hiddenProjectKeys = deserializeHiddenProjectKeys(persisted.hiddenProjectKeys);
  const hiddenSectionCollapsed =
    typeof persisted.hiddenSectionCollapsed === "boolean"
      ? persisted.hiddenSectionCollapsed
      : current.hiddenSectionCollapsed;

  if (
    areSetsEqual(current.hiddenProjectKeys, hiddenProjectKeys) &&
    current.hiddenSectionCollapsed === hiddenSectionCollapsed
  ) {
    return current;
  }

  return {
    ...current,
    hiddenProjectKeys,
    hiddenSectionCollapsed,
  };
}

function deserializeHiddenProjectKeys(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((key): key is string => typeof key === "string"));
}

function areSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}
