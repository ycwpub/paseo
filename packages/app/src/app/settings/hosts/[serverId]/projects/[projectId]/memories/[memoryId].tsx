import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function ProjectMemoryDetailRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    projectId?: string | string[];
    memoryId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const projectId = normalizeProjectSettingsRouteId(params.projectId);
  const memoryId = normalizeProjectSettingsRouteId(params.memoryId);
  const view = useMemo(
    () => ({ kind: "memory" as const, serverId, projectId, memoryId }),
    [memoryId, projectId, serverId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
