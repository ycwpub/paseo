import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MemoryScopePolicyEditor } from "@/memory/scope-policy-editor";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useHostFeature } from "@/runtime/host-features";
import type { WorkspaceSummary } from "@/utils/projects";
import { ProjectMemoryContentSection } from "./project-memory-content-section";

export function ProjectMemoryCard({
  serverId,
  projectId,
  workspaces,
}: {
  serverId: string;
  projectId: string;
  workspaces: readonly WorkspaceSummary[];
}) {
  const { t } = useTranslation();
  const isPolicySupported = useHostFeature(serverId, "memoryScopePolicies");
  const isMemorySupported = useHostFeature(serverId, "memory");
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
        <ProjectMemoryContentSection
          serverId={serverId}
          projectId={projectId}
          workspaces={workspaces}
          flush
        />
      ) : null}
    </SettingsGroup>
  );
}
