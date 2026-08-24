import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMemory } from "@/hooks/use-memory";
import { MemoryScopePolicyEditor } from "@/memory/scope-policy-editor";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useHostFeature } from "@/runtime/host-features";
import { MemoryManagementEntrySection } from "./memory-management-entry-section";
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
  const scope = useMemo(() => ({ type: "project" as const, id: projectId }), [projectId]);
  const memoryCount = useMemo(
    () =>
      (memory?.details ?? []).filter((detail) =>
        memoryDetailHasScope(detail, { type: "project", id: projectId }),
      ).length,
    [memory?.details, projectId],
  );
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

  if (!isPolicySupported && !isMemorySupported) return null;

  return (
    <SettingsGroup
      title={t("settings.project.memory.title")}
      info={t("settings.project.memory.info")}
      testID="project-memory-group"
    >
      {isPolicySupported ? (
        <SettingsSection
          title={t("settings.project.memory.policyTitle")}
          flush={!isMemorySupported}
        >
          <MemoryScopePolicyEditor
            serverId={serverId}
            scope={scope}
            copy={copy}
            testID="project-memory-policy"
          />
        </SettingsSection>
      ) : null}
      {isMemorySupported ? (
        <MemoryManagementEntrySection
          serverId={serverId}
          projectId={projectId}
          memoryCount={memoryCount}
          flush
        />
      ) : null}
    </SettingsGroup>
  );
}
