import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { MemoryManagementScreen } from "@/screens/settings/memory/memory-management-screen";
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

  return (
    <HostRouteBootstrapBoundary>
      <MemoryManagementScreen serverId={serverId} projectId={projectId} memoryId={memoryId} />
    </HostRouteBootstrapBoundary>
  );
}
