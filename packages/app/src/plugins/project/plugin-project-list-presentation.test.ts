import { describe, expect, it } from "vitest";
import { shouldShowPluginListCreateAction } from "./plugin-project-list-presentation";

describe("plugin project list presentation", () => {
  it("uses the main empty-state action for the first item", () => {
    expect(shouldShowPluginListCreateAction(0)).toBe(false);
  });

  it("shows the compact sidebar action after items exist", () => {
    expect(shouldShowPluginListCreateAction(1)).toBe(true);
    expect(shouldShowPluginListCreateAction(3)).toBe(true);
  });
});
