import { describe, expect, it } from "vitest";
import {
  createProcessExpansionState,
  isProcessTurnExpanded,
  toggleProcessTurn,
} from "./process-expansion-state";

describe("process expansion state", () => {
  it("defaults the active answer to expanded and completed answers to collapsed", () => {
    const state = createProcessExpansionState();

    expect(isProcessTurnExpanded(state, "turn-1", true)).toBe(true);
    expect(isProcessTurnExpanded(state, "turn-1", false)).toBe(false);
  });

  it("collapses on completion even after the user re-expands the active answer", () => {
    const collapsedWhileActive = toggleProcessTurn(createProcessExpansionState(), {
      turnId: "turn-1",
      isActive: true,
    });
    const expandedWhileActive = toggleProcessTurn(collapsedWhileActive, {
      turnId: "turn-1",
      isActive: true,
    });

    expect(isProcessTurnExpanded(collapsedWhileActive, "turn-1", true)).toBe(false);
    expect(isProcessTurnExpanded(expandedWhileActive, "turn-1", true)).toBe(true);
    expect(isProcessTurnExpanded(expandedWhileActive, "turn-1", false)).toBe(false);
    expect(isProcessTurnExpanded(expandedWhileActive, "turn-2", true)).toBe(true);
  });

  it("toggles completed answers independently", () => {
    const firstExpanded = toggleProcessTurn(createProcessExpansionState(), {
      turnId: "turn-1",
      isActive: false,
    });

    expect(isProcessTurnExpanded(firstExpanded, "turn-1", false)).toBe(true);
    expect(isProcessTurnExpanded(firstExpanded, "turn-2", false)).toBe(false);

    const secondExpanded = toggleProcessTurn(firstExpanded, {
      turnId: "turn-2",
      isActive: false,
    });
    const firstCollapsed = toggleProcessTurn(secondExpanded, {
      turnId: "turn-1",
      isActive: false,
    });

    expect(isProcessTurnExpanded(firstCollapsed, "turn-1", false)).toBe(false);
    expect(isProcessTurnExpanded(firstCollapsed, "turn-2", false)).toBe(true);
  });
});
