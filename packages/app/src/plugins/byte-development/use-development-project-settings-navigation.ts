import { useCallback } from "react";
import { useRouter } from "expo-router";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { resolveDevelopmentProjectSettingsRoute } from "./development-project-settings-stage-model";

export function useDevelopmentProjectSettingsNavigation({
  serverId,
  projectId,
  onNavigateAway,
}: {
  serverId: string;
  projectId: string | null | undefined;
  onNavigateAway?: () => void;
}) {
  const router = useRouter();
  const closePluginPanel = usePluginAppPanelStore((state) => state.close);

  return useCallback(() => {
    const route = resolveDevelopmentProjectSettingsRoute({ serverId, projectId });
    if (!route) return;
    onNavigateAway?.();
    closePluginPanel();
    router.push(route);
  }, [closePluginPanel, onNavigateAway, projectId, router, serverId]);
}
