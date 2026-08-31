import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateSidebarViewState, useSidebarViewStore } from "./sidebar-view-store";
import { useSidebarSortStore } from "./sidebar-sort-store";
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
describe("sidebar view store", () => {
  beforeEach(() => {
    useSidebarViewStore.setState({
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
    });
    useSidebarSortStore.setState({ sortMode: "activity" });
  });
  it("switches between recent-activity, project-name, and manual project ordering", () => {
    useSidebarSortStore.getState().setSortMode("name");
    expect(useSidebarSortStore.getState().sortMode).toBe("name");
    useSidebarSortStore.getState().setSortMode("manual");
    expect(useSidebarSortStore.getState().sortMode).toBe("manual");
    useSidebarSortStore.getState().setSortMode("activity");
    expect(useSidebarSortStore.getState().sortMode).toBe("activity");
  });
  it("migrates legacy per-host group modes to the new global mode", () => {
    expect(
      migrateSidebarViewState({
        groupModeByServerId: {
          "host-a": "project",
          "host-b": "status",
        },
      }),
    ).toEqual({
      groupMode: "status",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
    });
  });
  it("migrates a pre-v2 single host filter to the multi-host list", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "status",
        hostFilter: "host-a",
      }),
    ).toEqual({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: [],
      labelFilter: { labels: [] },
    });
  });
  // The persisted schema is a `z.strictObject` behind `createValidatedPersistStorage`, so a key
  // the schema does not list fails the parse and takes every other sidebar setting down with it.
  it("carries a persisted project filter through the version migration", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "project",
        hostFilters: ["host-a"],
        projectFilters: ["project-a", "project-b"],
      }),
    ).toEqual({
      groupMode: "project",
      hostFilters: ["host-a"],
      projectFilters: ["project-a", "project-b"],
      labelFilter: { labels: [] },
    });
  });
  it("never keeps project filters from state the schema rejects", () => {
    expect(migrateSidebarViewState({ projectFilters: "project-a" })).toEqual({
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
    });
  });
});
