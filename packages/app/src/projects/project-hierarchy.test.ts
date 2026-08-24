import { describe, expect, it } from "vitest";
import { flattenProjectHierarchy, flattenVisibleProjectHierarchy } from "./project-hierarchy";

describe("flattenProjectHierarchy", () => {
  it("places child Projects directly below their parent", () => {
    const projects = [
      { viewKey: "other", parentViewKey: null },
      { viewKey: "child", parentViewKey: "parent" },
      { viewKey: "parent", parentViewKey: null },
      { viewKey: "grandchild", parentViewKey: "child" },
    ];

    expect(flattenProjectHierarchy(projects)).toEqual([
      { viewKey: "other", parentViewKey: null, hierarchyDepth: 0 },
      { viewKey: "parent", parentViewKey: null, hierarchyDepth: 0 },
      { viewKey: "child", parentViewKey: "parent", hierarchyDepth: 1 },
      { viewKey: "grandchild", parentViewKey: "child", hierarchyDepth: 2 },
    ]);
  });

  it("keeps missing or cyclic parents visible as roots", () => {
    const projects = [
      { viewKey: "orphan", parentViewKey: "missing" },
      { viewKey: "self", parentViewKey: "self" },
      { viewKey: "cycle-a", parentViewKey: "cycle-b" },
      { viewKey: "cycle-b", parentViewKey: "cycle-a" },
    ];

    expect(flattenProjectHierarchy(projects)).toEqual([
      { viewKey: "orphan", parentViewKey: "missing", hierarchyDepth: 0 },
      { viewKey: "self", parentViewKey: "self", hierarchyDepth: 0 },
      { viewKey: "cycle-a", parentViewKey: "cycle-b", hierarchyDepth: 0 },
      { viewKey: "cycle-b", parentViewKey: "cycle-a", hierarchyDepth: 1 },
    ]);
  });

  it("hides every descendant of a collapsed parent Project", () => {
    const projects = [
      { viewKey: "parent", parentViewKey: null },
      { viewKey: "child", parentViewKey: "parent" },
      { viewKey: "grandchild", parentViewKey: "child" },
      { viewKey: "other", parentViewKey: null },
    ];

    expect(flattenVisibleProjectHierarchy(projects, new Set(["parent"]))).toEqual([
      { viewKey: "parent", parentViewKey: null, hierarchyDepth: 0 },
      { viewKey: "other", parentViewKey: null, hierarchyDepth: 0 },
    ]);
  });

  it("preserves child collapse preferences while only hiding their descendants", () => {
    const projects = [
      { viewKey: "parent", parentViewKey: null },
      { viewKey: "child", parentViewKey: "parent" },
      { viewKey: "grandchild", parentViewKey: "child" },
    ];

    expect(flattenVisibleProjectHierarchy(projects, new Set(["child"]))).toEqual([
      { viewKey: "parent", parentViewKey: null, hierarchyDepth: 0 },
      { viewKey: "child", parentViewKey: "parent", hierarchyDepth: 1 },
    ]);
    expect(flattenVisibleProjectHierarchy(projects, new Set())).toHaveLength(3);
  });
});
