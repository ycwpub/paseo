import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MemoryScopePolicyEditor } from "@/memory/scope-policy-editor";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { useHostFeature } from "@/runtime/host-features";

export function ProjectMemoryCard({
  serverId,
  projectId,
}: {
  serverId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const isSupported = useHostFeature(serverId, "memoryScopePolicies");
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

  if (!isSupported) return null;

  return (
    <SettingsGroup
      title={t("settings.project.memory.title")}
      info={t("settings.project.memory.info")}
      testID="project-memory-group"
    >
      <MemoryScopePolicyEditor
        serverId={serverId}
        scope={scope}
        copy={copy}
        testID="project-memory-policy"
      />
    </SettingsGroup>
  );
}
