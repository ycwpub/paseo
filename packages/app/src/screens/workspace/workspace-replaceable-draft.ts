import type { DraftRecord } from "@/stores/draft-store/state";
import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";

export function resolveReplaceableWorkspaceDraftTabId(input: {
  tab: WorkspaceTab | null;
  serverId: string;
  draftRecord: DraftRecord | undefined;
  pendingCreate: PendingCreateAttempt | undefined;
}): string | null {
  const { tab } = input;
  if (!tab || tab.target.kind !== "draft" || tab.target.setup) {
    return null;
  }
  if (
    input.pendingCreate?.serverId === input.serverId &&
    input.pendingCreate.lifecycle === "active"
  ) {
    return null;
  }
  if (
    input.draftRecord?.lifecycle === "active" &&
    (input.draftRecord.input.text.trim().length > 0 ||
      input.draftRecord.input.attachments.length > 0)
  ) {
    return null;
  }
  return tab.tabId;
}
