import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function AssistantSettingsRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    assistantId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const routeAssistantId = normalizeProjectSettingsRouteId(params.assistantId);
  const assistantId = routeAssistantId === "new" ? undefined : routeAssistantId;
  const view = useMemo(
    () => ({ kind: "assistant" as const, serverId, ...(assistantId ? { assistantId } : {}) }),
    [assistantId, serverId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
