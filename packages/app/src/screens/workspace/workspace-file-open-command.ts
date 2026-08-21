import { createWorkspaceFileTabTarget } from "@/workspace/file-open";
import { canonicalizeWorkspaceFileLocation } from "@/workspace/file-open/canonical-location";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

interface OpenWorkspaceFileFromExplorerInput {
  filePath: string;
  workspaceRoot: string | null;
  persistenceKey: string | null;
  showMobileAgent: () => void;
  openWorkspaceTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  focusWorkspaceTab: (workspaceKey: string, tabId: string) => void;
}

export function openWorkspaceFileFromExplorer(input: OpenWorkspaceFileFromExplorerInput): void {
  input.showMobileAgent();
  if (!input.persistenceKey) {
    return;
  }
  const location = canonicalizeWorkspaceFileLocation({
    location: { path: input.filePath },
    workspaceRoot: input.workspaceRoot,
  });
  if (!location) {
    return;
  }
  const tabId = input.openWorkspaceTabFocused(
    input.persistenceKey,
    createWorkspaceFileTabTarget(location),
  );
  if (tabId) {
    input.focusWorkspaceTab(input.persistenceKey, tabId);
  }
}
