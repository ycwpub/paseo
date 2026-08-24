import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { MemoryManagementScreen } from "@/screens/settings/memory/memory-management-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function HostMemoryListRoute() {
  const params = useLocalSearchParams<{ serverId?: string | string[] }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);

  return (
    <HostRouteBootstrapBoundary>
      <MemoryManagementScreen serverId={serverId} />
    </HostRouteBootstrapBoundary>
  );
}
