import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import { normalizeProjectSettingsRouteId } from "@/utils/host-routes";

export default function InstructionTemplateSettingsRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    templateId?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const routeTemplateId = normalizeProjectSettingsRouteId(params.templateId);
  const templateId = routeTemplateId === "new" ? undefined : routeTemplateId;
  const view = useMemo(
    () => ({
      kind: "instruction-template" as const,
      serverId,
      ...(templateId ? { templateId } : {}),
    }),
    [serverId, templateId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
