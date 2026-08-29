import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import {
  normalizeHostMemorySettingsPage,
  normalizeProjectSettingsRouteId,
} from "@/utils/host-routes";

export default function HostMemorySettingsPageRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    memoryPage?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const rawPage = normalizeProjectSettingsRouteId(params.memoryPage);
  const page = normalizeHostMemorySettingsPage(rawPage) ?? "policies";
  const view = useMemo(() => ({ kind: "memory-page" as const, serverId, page }), [page, serverId]);

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
