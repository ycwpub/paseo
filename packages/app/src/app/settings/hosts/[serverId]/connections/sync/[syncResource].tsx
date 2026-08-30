import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeHostResourceSyncPage } from "@/utils/host-feature-routes";

export default function HostResourceSyncRoute() {
  const params = useLocalSearchParams<{ serverId?: string; syncResource?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId.trim() : "";
  const rawPage = typeof params.syncResource === "string" ? params.syncResource : "";
  const page = normalizeHostResourceSyncPage(rawPage) ?? "memory";
  const view = useMemo(
    () => ({ kind: "resource-sync" as const, serverId, page }),
    [page, serverId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
