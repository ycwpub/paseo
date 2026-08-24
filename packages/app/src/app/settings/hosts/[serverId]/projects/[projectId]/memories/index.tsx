import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { MemoryManagementScreen } from "@/screens/settings/memory/memory-management-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function ProjectMemoryListRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    projectId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const projectId = normalizeProjectSettingsRouteId(params.projectId);

  return (
    <HostRouteBootstrapBoundary>
      <MemoryManagementScreen serverId={serverId} projectId={projectId} />
    </HostRouteBootstrapBoundary>
  );
}
