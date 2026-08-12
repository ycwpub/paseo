export interface ActiveProcessExpansion {
  turnId: string;
  expanded: boolean;
}

export interface ProcessExpansionState {
  expandedCompletedTurnIds: ReadonlySet<string>;
  activeTurn: ActiveProcessExpansion | null;
  revision: boolean;
}

export function createProcessExpansionState(): ProcessExpansionState {
  return {
    expandedCompletedTurnIds: new Set(),
    activeTurn: null,
    revision: false,
  };
}

export function isProcessTurnExpanded(
  state: ProcessExpansionState,
  turnId: string,
  isActive: boolean,
): boolean {
  if (isActive) {
    return state.activeTurn?.turnId === turnId ? state.activeTurn.expanded : true;
  }
  return state.expandedCompletedTurnIds.has(turnId);
}

export function toggleProcessTurn(
  state: ProcessExpansionState,
  input: { turnId: string; isActive: boolean },
): ProcessExpansionState {
  if (input.isActive) {
    const expanded = isProcessTurnExpanded(state, input.turnId, true);
    return {
      ...state,
      activeTurn: { turnId: input.turnId, expanded: !expanded },
      revision: !state.revision,
    };
  }

  const expandedCompletedTurnIds = new Set(state.expandedCompletedTurnIds);
  if (expandedCompletedTurnIds.has(input.turnId)) {
    expandedCompletedTurnIds.delete(input.turnId);
  } else {
    expandedCompletedTurnIds.add(input.turnId);
  }
  return {
    ...state,
    expandedCompletedTurnIds,
    revision: !state.revision,
  };
}
