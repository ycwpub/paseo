import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function AssistantMemorySettingsRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    assistantId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const assistantId = normalizeProjectSettingsRouteId(params.assistantId);
  const view = useMemo(
    () => ({ kind: "assistant-memory" as const, serverId, assistantId }),
    [assistantId, serverId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
