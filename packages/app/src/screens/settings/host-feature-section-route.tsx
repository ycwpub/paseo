import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import type { FeatureHostSectionSlug } from "@/utils/host-feature-routes";

export function HostFeatureSectionRoute({ section }: { section: FeatureHostSectionSlug }) {
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId.trim() : "";
  const view = useMemo(() => ({ kind: "host" as const, serverId, section }), [serverId, section]);

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
