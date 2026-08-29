import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function SkillSettingsRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    skillId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const routeSkillId = normalizeProjectSettingsRouteId(params.skillId);
  const skillId = routeSkillId === "new" ? undefined : routeSkillId;
  const view = useMemo(
    () => ({
      kind: "skill" as const,
      serverId,
      ...(skillId ? { skillId } : {}),
    }),
    [serverId, skillId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
