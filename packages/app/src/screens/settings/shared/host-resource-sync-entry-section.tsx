import { useCallback } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  buildHostResourceSyncRoute,
  type HostResourceSyncPage,
} from "@/utils/host-feature-routes";
import { HOST_RESOURCE_SYNC_ENTRIES } from "./host-resource-sync-model";

function HostResourceSyncEntryRow({
  serverId,
  page,
  title,
  description,
}: {
  serverId: string;
  page: HostResourceSyncPage;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const open = useCallback(
    () => router.push(buildHostResourceSyncRoute(serverId, page)),
    [page, router, serverId],
  );

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{description}</Text>
      </View>
      <Button size="sm" variant="outline" onPress={open}>
        打开
      </Button>
    </View>
  );
}

export function HostResourceSyncEntrySection({ serverId }: { serverId: string }) {
  return (
    <SettingsSection title="多主机共享">
      <View style={settingsStyles.card} testID="host-resource-sync-entries">
        {HOST_RESOURCE_SYNC_ENTRIES.map((entry) => (
          <HostResourceSyncEntryRow key={entry.page} serverId={serverId} {...entry} />
        ))}
      </View>
    </SettingsSection>
  );
}
