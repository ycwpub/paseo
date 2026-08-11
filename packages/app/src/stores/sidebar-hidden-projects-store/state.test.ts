import { describe, expect, it } from "vitest";
import {
  type HiddenProjectsState,
  mergePersistedHiddenProjects,
  serializeHiddenProjects,
  setProjectHidden,
  toggleHiddenSection,
} from "./state";

function defaultState(): HiddenProjectsState {
  return {
    hiddenProjectKeys: new Set(),
    hiddenSectionCollapsed: true,
  };
}

describe("sidebar hidden projects transitions", () => {
  it("hides and shows projects", () => {
    let state = defaultState();

    state = setProjectHidden(state, "project-a", true);
    state = setProjectHidden(state, "project-b", true);
    state = setProjectHidden(state, "project-a", false);

    expect(Array.from(state.hiddenProjectKeys)).toEqual(["project-b"]);
  });

  it("defaults the hidden section to collapsed and toggles it", () => {
    expect(toggleHiddenSection(defaultState()).hiddenSectionCollapsed).toBe(false);
  });

  it("serializes and restores persisted state", () => {
    const serialized = serializeHiddenProjects({
      hiddenProjectKeys: new Set(["project-a", "project-b"]),
      hiddenSectionCollapsed: false,
    });
    expect(serialized).toEqual({
      hiddenProjectKeys: ["project-a", "project-b"],
      hiddenSectionCollapsed: false,
    });

    const restored = mergePersistedHiddenProjects(
      {
        hiddenProjectKeys: ["project-a", 42, "project-b"],
        hiddenSectionCollapsed: false,
      },
      defaultState(),
    );
    expect(Array.from(restored.hiddenProjectKeys)).toEqual(["project-a", "project-b"]);
    expect(restored.hiddenSectionCollapsed).toBe(false);
  });
});
