import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useMemory } from "@/hooks/use-memory";
import { MemoryScopePolicyEditor } from "@/memory/scope-policy-editor";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useHostFeature } from "@/runtime/host-features";
import { settingsStyles } from "@/styles/settings";
import { buildProjectMemoryRoute } from "@/utils/host-feature-routes";
import { memoryDetailHasScope } from "./memory-multi-scope";

export function ProjectMemoryCard({
  serverId,
  projectId,
}: {
  serverId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const isPolicySupported = useHostFeature(serverId, "memoryScopePolicies");
  const isMemorySupported = useHostFeature(serverId, "memory");
  const { memory } = useMemory(serverId, { enabled: isMemorySupported });
  const router = useRouter();
  const memoryCount = useMemo(
    () =>
      (memory?.details ?? []).filter((detail) =>
        memoryDetailHasScope(detail, { type: "project", id: projectId }),
      ).length,
    [memory?.details, projectId],
  );
  const open = useCallback(() => {
    router.push(buildProjectMemoryRoute(serverId, projectId));
  }, [projectId, router, serverId]);

  if (!isPolicySupported && !isMemorySupported) return null;

  return (
    <SettingsGroup
      title={t("settings.project.memory.title")}
      info={t("settings.project.memory.info")}
      testID="project-memory-group"
    >
      <SettingsSection title="记忆配置" flush>
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>配置记忆</Text>
              <Text style={settingsStyles.rowHint}>
                管理 Project 记忆规范、总览和明细。当前共 {memoryCount} 条记忆。
              </Text>
            </View>
            <Button size="sm" variant="outline" onPress={open} testID="project-memory-entry">
              配置记忆
            </Button>
          </View>
        </View>
      </SettingsSection>
    </SettingsGroup>
  );
}

export function ProjectMemoryPolicySection({
  serverId,
  projectId,
}: {
  serverId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const isPolicySupported = useHostFeature(serverId, "memoryScopePolicies");
  const scope = useMemo(() => ({ type: "project" as const, id: projectId }), [projectId]);
  const copy = useMemo(
    () => ({
      enabledTitle: t("settings.project.memory.enabledTitle"),
      enabledHint: t("settings.project.memory.enabledHint"),
      instructionsTitle: t("settings.project.memory.instructionsTitle"),
      instructionsHint: t("settings.project.memory.instructionsHint"),
      instructionsPlaceholder: t("settings.project.memory.instructionsPlaceholder"),
      save: t("settings.project.memory.save"),
      saving: t("settings.project.memory.saving"),
      saved: t("settings.project.memory.saved"),
      saveError: t("settings.project.memory.saveError"),
    }),
    [t],
  );

  if (!isPolicySupported) return null;

  return (
    <SettingsSection title={t("settings.project.memory.policyTitle")}>
      <MemoryScopePolicyEditor
        serverId={serverId}
        scope={scope}
        copy={copy}
        testID="project-memory-policy"
      />
    </SettingsSection>
  );
}
