import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function McpServerSettingsRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    mcpServerId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const routeMcpServerId = normalizeProjectSettingsRouteId(params.mcpServerId);
  const mcpServerId = routeMcpServerId === "new" ? undefined : routeMcpServerId;
  const view = useMemo(
    () => ({
      kind: "mcp-server" as const,
      serverId,
      ...(mcpServerId ? { mcpServerId } : {}),
    }),
    [mcpServerId, serverId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
