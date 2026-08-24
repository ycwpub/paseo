import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { MemoryManagementScreen } from "@/screens/settings/memory/memory-management-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function HostMemoryDetailRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    memoryId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const memoryId = normalizeProjectSettingsRouteId(params.memoryId);

  return (
    <HostRouteBootstrapBoundary>
      <MemoryManagementScreen serverId={serverId} memoryId={memoryId} />
    </HostRouteBootstrapBoundary>
  );
}
