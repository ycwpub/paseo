import { useEffect, useRef } from "react";
import { useWorkspaceStatusesForBadges } from "@/stores/session-store-hooks";
import { deriveMacDockBadgeCountFromWorkspaceStatuses } from "@/utils/desktop-badge-state";
import { clearDesktopAttention } from "./desktop-attention";

export function shouldClearDesktopAttention(
  previousCount: number | undefined,
  nextCount: number | undefined,
): boolean {
  return previousCount !== undefined && nextCount === undefined;
}

export function useClearDesktopAttentionWhenRead(): void {
  const workspaceStatuses = useWorkspaceStatusesForBadges();
  const previousCountRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const nextCount = deriveMacDockBadgeCountFromWorkspaceStatuses(workspaceStatuses);
    if (shouldClearDesktopAttention(previousCountRef.current, nextCount)) {
      clearDesktopAttention();
    }
    previousCountRef.current = nextCount;
  }, [workspaceStatuses]);
}
