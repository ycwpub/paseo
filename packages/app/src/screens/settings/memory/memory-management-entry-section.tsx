import { useCallback } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { buildHostMemoryRoute, buildProjectMemoryRoute } from "@/utils/host-routes";

export function MemoryManagementEntrySection({
  serverId,
  projectId,
  memoryCount,
  flush,
}: {
  serverId: string;
  projectId?: string;
  memoryCount: number;
  flush?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const openManager = useCallback(() => {
    router.push(
      projectId ? buildProjectMemoryRoute(serverId, projectId) : buildHostMemoryRoute(serverId),
    );
  }, [projectId, router, serverId]);
  const prefix = projectId ? "settings.project.memory.content" : "memoryPolicies.contentManager";

  return (
    <SettingsSection title={t(`${prefix}.title`)} flush={flush}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("memoryPolicies.contentManager.manage")}</Text>
            <Text style={settingsStyles.rowHint}>
              {t("memoryPolicies.contentManager.manageDescription", {
                count: memoryCount,
              })}
            </Text>
          </View>
          <Button size="sm" variant="outline" onPress={openManager}>
            {t("memoryPolicies.contentManager.openManager")}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}
