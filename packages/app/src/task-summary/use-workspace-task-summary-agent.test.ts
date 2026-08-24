import { describe, expect, it } from "vitest";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { resolveWorkspaceTaskSummaryAgentId } from "./use-workspace-task-summary-agent";

function paneLayout(target: WorkspaceTab["target"]): WorkspaceLayout {
  return {
    focusedPaneId: "main",
    root: {
      kind: "pane",
      pane: {
        id: "main",
        tabIds: ["tab-1"],
        focusedTabId: "tab-1",
        tabs: [{ tabId: "tab-1", target, createdAt: 1 }],
      },
    },
  } as WorkspaceLayout;
}

describe("resolveWorkspaceTaskSummaryAgentId", () => {
  it("returns the agent in the focused pane", () => {
    expect(
      resolveWorkspaceTaskSummaryAgentId(paneLayout({ kind: "agent", agentId: "agent-1" })),
    ).toBe("agent-1");
  });

  it("does not expose task summary for a non-agent tab", () => {
    expect(
      resolveWorkspaceTaskSummaryAgentId(paneLayout({ kind: "file", path: "/repo/README.md" })),
    ).toBeNull();
  });

  it("returns null without a workspace layout", () => {
    expect(resolveWorkspaceTaskSummaryAgentId(null)).toBeNull();
  });
});
