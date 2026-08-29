import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function TeamSettingsRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    teamId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const routeTeamId = normalizeProjectSettingsRouteId(params.teamId);
  const teamId = routeTeamId === "new" ? undefined : routeTeamId;
  const view = useMemo(
    () => ({ kind: "team" as const, serverId, ...(teamId ? { teamId } : {}) }),
    [serverId, teamId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
