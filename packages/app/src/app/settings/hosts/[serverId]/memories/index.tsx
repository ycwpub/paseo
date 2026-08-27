import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function HostMemoryListRoute() {
  const params = useLocalSearchParams<{ serverId?: string | string[] }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const view = useMemo(() => ({ kind: "memory" as const, serverId }), [serverId]);

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
