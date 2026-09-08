import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("sidebar Workspace bulk actions wiring", () => {
  it("routes Project-group and status-group row presses through bulk selection", () => {
    for (const fileName of ["../sidebar-workspace-list.tsx", "./sidebar-status-list.tsx"]) {
      const contents = source(fileName);
      expect(contents).toContain("useSidebarWorkspaceBulkSelection(workspace.workspaceKey)");
      expect(contents).toContain("bulkSelection.toggle()");
      expect(contents).toContain("bulkSelection.active");
    }
  });

  it("replaces the status visual with a selection indicator while selecting", () => {
    const contents = source("./sidebar-workspace-row-content.tsx");
    expect(contents).toContain("SidebarWorkspaceBulkSelectionIndicator");
    expect(contents).toContain("selected={bulkSelection.selected}");
    expect(contents).toContain("disabled={contextMenuOpen || bulkSelection.active}");
  });

  it("keeps archive, delete, and cancel controls in the Workspace header", () => {
    const contents = source("./sidebar-workspaces-section-header.tsx");
    expect(contents).toContain('testID="sidebar-bulk-archive-workspaces"');
    expect(contents).toContain('testID="sidebar-bulk-remove-workspaces"');
    expect(contents).toContain('testID="sidebar-cancel-workspace-selection"');
  });
});
