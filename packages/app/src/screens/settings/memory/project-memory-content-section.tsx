import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { useMemory } from "@/hooks/use-memory";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import type { WorkspaceSummary } from "@/utils/projects";
import { confirmDialog } from "@/utils/confirm-dialog";
import { memoryDetailEdit, type MemoryDetailDraft } from "./memory-detail-draft";
import { MemoryDetailCard } from "./memory-detail-card";
import { memoryDetailMatchesScope } from "./memory-content-manager-model";
import { MEMORY_STATUS_OPTIONS, type MemoryStatusFilter } from "./memory-form-options";
import { filterMemoryDetails } from "./memory-view-model";

type ProjectMemoryScopeType = "project" | "workspace";

const SCOPE_OPTIONS: ProjectMemoryScopeType[] = ["project", "workspace"];

function workspaceKey(workspace: WorkspaceSummary): string {
  return workspace.id;
}

function projectMemoryScope(input: {
  scopeType: ProjectMemoryScopeType;
  projectId: string;
  workspace: WorkspaceSummary | null;
}): PaseoMemoryScope | null {
  if (input.scopeType === "project") {
    return { type: "project", id: input.projectId };
  }
  if (!input.workspace) return null;
  return { type: "workspace", id: input.workspace.id };
}

export function ProjectMemoryContentSection({
  serverId,
  projectId,
  workspaces,
  flush,
}: {
  serverId: string;
  projectId: string;
  workspaces: readonly WorkspaceSummary[];
  flush?: boolean;
}) {
  const { t } = useTranslation();
  const { memory, isLoading, error, updateMemory, isMutating, mutationError } = useMemory(serverId);
  const [scopeType, setScopeType] = useState<ProjectMemoryScopeType>("project");
  const [workspaceId, setWorkspaceId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MemoryStatusFilter>("all");
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0] ?? null,
    [workspaceId, workspaces],
  );
  const selectedScope = useMemo<PaseoMemoryScope | null>(
    () => projectMemoryScope({ scopeType, projectId, workspace: selectedWorkspace }),
    [projectId, scopeType, selectedWorkspace],
  );
  const visibleDetails = useMemo(
    () =>
      filterMemoryDetails({
        details: (memory?.details ?? []).filter((detail) =>
          memoryDetailMatchesScope(detail, selectedScope),
        ),
        search,
        status,
        scope: "all",
      }),
    [memory?.details, search, selectedScope, status],
  );
  const scopeOptions = useMemo<SelectFieldOption<ProjectMemoryScopeType>[]>(
    () =>
      SCOPE_OPTIONS.map((type) => ({
        id: type,
        value: type,
        label: t(`settings.project.memory.content.scopes.${type}`),
      })),
    [t],
  );
  const scopeDisplay = useMemo(
    () => ({ label: t(`settings.project.memory.content.scopes.${scopeType}`) }),
    [scopeType, t],
  );
  const workspaceOptions = useMemo<SelectFieldOption<WorkspaceSummary>[]>(
    () =>
      workspaces.map((workspace) => ({
        id: workspace.id,
        value: workspace,
        label: workspace.title?.trim() || workspace.name,
        description: workspace.id,
      })),
    [workspaces],
  );
  const workspaceDisplay = useMemo(
    () =>
      selectedWorkspace
        ? {
            label: selectedWorkspace.title?.trim() || selectedWorkspace.name,
            description: selectedWorkspace.id,
          }
        : null,
    [selectedWorkspace],
  );
  const statusDisplay = useMemo(
    () => ({
      label: MEMORY_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status,
    }),
    [status],
  );
  const selectWorkspace = useCallback((workspace: WorkspaceSummary) => {
    setWorkspaceId(workspace.id);
  }, []);
  const saveDetail = useCallback(
    async (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => {
      await updateMemory({
        detailEdits: [
          memoryDetailEdit({
            detail,
            draft,
            globalUserId: memory?.activeUserId ?? memory?.users?.[0]?.id ?? "default",
          }),
        ],
      });
    },
    [memory?.activeUserId, memory?.users, updateMemory],
  );
  const deleteDetail = useCallback(
    async (detail: PaseoMemoryDetail) => {
      const confirmed = await confirmDialog({
        title: t("settings.project.memory.content.deleteTitle", { title: detail.title }),
        message: t("settings.project.memory.content.deleteDescription"),
        confirmLabel: t("settings.project.memory.content.deleteConfirm"),
        destructive: true,
      });
      if (confirmed) await updateMemory({ deleteDetailIds: [detail.id] });
    },
    [t, updateMemory],
  );
  const visibleError = mutationError?.message ?? error?.message ?? null;
  const emptyMessage = selectedScope
    ? t("settings.project.memory.content.empty")
    : t("settings.project.memory.content.noWorkspace");
  let memoryContent: ReactNode;
  if (isLoading) {
    memoryContent = (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>{t("settings.project.memory.content.loading")}</Text>
        </View>
      </View>
    );
  } else if (visibleDetails.length === 0) {
    memoryContent = (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>{emptyMessage}</Text>
        </View>
      </View>
    );
  } else {
    memoryContent = visibleDetails.map((detail) => (
      <MemoryDetailCard
        key={detail.id}
        detail={detail}
        disabled={isMutating}
        scopeEditable={false}
        onSave={saveDetail}
        onDelete={deleteDetail}
      />
    ));
  }

  return (
    <SettingsSection
      title={t("settings.project.memory.content.title")}
      testID="project-memory-content"
      flush={flush}
    >
      <Text style={settingsStyles.rowHint}>{t("settings.project.memory.content.description")}</Text>
      {visibleError ? (
        <Alert
          variant="error"
          title={t("settings.project.memory.content.errorTitle")}
          description={visibleError}
        />
      ) : null}
      <View style={settingsStyles.card}>
        <View style={styles.filters}>
          <View style={styles.filter}>
            <SelectField
              label={t("settings.project.memory.content.scope")}
              value={scopeType}
              selectedDisplay={scopeDisplay}
              options={scopeOptions}
              onChange={setScopeType}
              placeholder={t("settings.project.memory.content.selectScope")}
              emptyText={t("settings.project.memory.content.noScopes")}
            />
          </View>
          {scopeType === "workspace" ? (
            <View style={styles.filter}>
              <SelectField
                label="Workspace"
                value={selectedWorkspace}
                selectedDisplay={workspaceDisplay}
                options={workspaceOptions}
                onChange={selectWorkspace}
                getValueKey={workspaceKey}
                searchable
                placeholder={t("settings.project.memory.content.selectWorkspace")}
                emptyText={t("settings.project.memory.content.noWorkspace")}
              />
            </View>
          ) : null}
          <View style={styles.search}>
            <Field label={t("memoryPolicies.contentManager.search")}>
              <FormTextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("memoryPolicies.contentManager.searchPlaceholder")}
              />
            </Field>
          </View>
          <View style={styles.status}>
            <SelectField
              label={t("memoryPolicies.contentManager.status")}
              value={status}
              selectedDisplay={statusDisplay}
              options={MEMORY_STATUS_OPTIONS}
              onChange={setStatus}
              placeholder={t("memoryPolicies.contentManager.allStatuses")}
              emptyText={t("memoryPolicies.contentManager.noStatuses")}
            />
          </View>
        </View>
      </View>
      {memoryContent}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  filters: {
    padding: theme.spacing[4],
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  filter: {
    flex: 1,
    minWidth: 180,
  },
  search: {
    flex: 2,
    minWidth: 220,
  },
  status: {
    flex: 1,
    minWidth: 150,
  },
}));
