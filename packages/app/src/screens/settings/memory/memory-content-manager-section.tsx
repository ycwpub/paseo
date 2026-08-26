import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemoryScope,
  PaseoMemoryState,
} from "@getpaseo/protocol/messages";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { useAssistants } from "@/hooks/use-assistants";
import { useProjects } from "@/hooks/use-projects";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { MemoryCreateCard } from "./memory-create-card";
import {
  buildMemoryContentTargetOptions,
  memoryDetailMatchesScope,
  type MemoryContentTargetOption,
} from "./memory-content-manager-model";
import type { MemoryDetailDraft } from "./memory-detail-draft";
import { MemoryDetailCard } from "./memory-detail-card";
import { MEMORY_STATUS_OPTIONS, type MemoryStatusFilter } from "./memory-form-options";
import type { MemoryScopeEntity } from "./memory-scope-policy-options";
import { filterMemoryDetails, type MemoryScopeFilter } from "./memory-view-model";

type ManagedScopeType = PaseoMemoryScope["type"];

const SCOPE_TYPES: ManagedScopeType[] = ["global", "project", "workspace", "assistant"];

function optionKey(option: MemoryContentTargetOption): string {
  return `${option.scope.type}:${option.scope.id}`;
}

export function MemoryContentManagerSection({
  serverId,
  memory,
  search,
  statusFilter,
  scopeFilter,
  isMutating,
  onSearchChange,
  onStatusFilterChange,
  onScopeFilterChange,
  onCreateDetail,
  onSaveDetail,
  onDeleteDetail,
}: {
  serverId: string;
  memory: PaseoMemoryState;
  search: string;
  statusFilter: MemoryStatusFilter;
  scopeFilter: MemoryScopeFilter;
  isMutating: boolean;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: MemoryStatusFilter) => void;
  onScopeFilterChange: (scope: MemoryScopeFilter) => void;
  onCreateDetail: (input: PaseoMemoryCreateInput) => Promise<void>;
  onSaveDetail: (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => Promise<void>;
  onDeleteDetail: (detail: PaseoMemoryDetail) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { projects } = useProjects();
  const assistantsSupported = useHostFeature(serverId, "assistants");
  const assistants = useAssistants(serverId, { enabled: assistantsSupported });
  const [selectedIds, setSelectedIds] = useState<
    Partial<Record<Exclude<ManagedScopeType, "global">, string>>
  >({});
  const scopeType: ManagedScopeType = scopeFilter === "all" ? "global" : scopeFilter;

  const entities = useMemo(() => {
    const projectEntities: MemoryScopeEntity[] = [];
    const workspaceEntities: MemoryScopeEntity[] = [];
    for (const project of projects) {
      for (const host of project.hosts) {
        if (host.serverId !== serverId) continue;
        projectEntities.push({
          id: host.projectId,
          label: host.projectCustomName ?? host.projectName,
          description: host.repoRoot,
        });
        for (const workspace of host.workspaces) {
          workspaceEntities.push({
            id: workspace.id,
            label: workspace.title?.trim() || workspace.name,
            description: host.projectCustomName ?? host.projectName,
          });
        }
      }
    }
    return {
      projects: projectEntities,
      workspaces: workspaceEntities,
      assistants: assistants.assistants.map((assistant) => ({
        id: assistant.id,
        label: assistant.name.trim() || assistant.id,
        description: assistant.description.trim() || undefined,
      })),
    };
  }, [assistants.assistants, projects, serverId]);

  const targetOptionsByType = useMemo(
    () =>
      buildMemoryContentTargetOptions({
        ...entities,
        details: memory.details,
      }),
    [entities, memory.details],
  );
  const targetOptions = useMemo(
    () => (scopeType === "global" ? [] : targetOptionsByType[scopeType]),
    [scopeType, targetOptionsByType],
  );
  const selectedTarget = useMemo(
    () =>
      scopeType === "global"
        ? null
        : (targetOptions.find((option) => option.id === selectedIds[scopeType]) ??
          targetOptions[0] ??
          null),
    [scopeType, selectedIds, targetOptions],
  );
  const selectedScope = useMemo<PaseoMemoryScope | null>(
    () =>
      scopeType === "global"
        ? {
            type: "global",
            id: memory.activeUserId ?? memory.users?.[0]?.id ?? "default",
          }
        : (selectedTarget?.scope ?? null),
    [memory.activeUserId, memory.users, scopeType, selectedTarget],
  );
  const visibleDetails = useMemo(
    () =>
      filterMemoryDetails({
        details: memory.details.filter((detail) => memoryDetailMatchesScope(detail, selectedScope)),
        search,
        status: statusFilter,
        scope: "all",
      }),
    [memory.details, search, selectedScope, statusFilter],
  );
  const scopeTypeOptions = useMemo<SelectFieldOption<MemoryScopeFilter>[]>(
    () =>
      SCOPE_TYPES.map((type) => ({
        id: type,
        value: type,
        label: t(`memoryPolicies.scopeManager.types.${type}`),
      })),
    [t],
  );
  const selectedScopeDisplay = useMemo(
    () => ({
      label: t(`memoryPolicies.scopeManager.types.${scopeType}`),
    }),
    [scopeType, t],
  );
  const targetSelectOptions = useMemo<SelectFieldOption<MemoryContentTargetOption>[]>(
    () =>
      targetOptions.map((option) => ({
        id: optionKey(option),
        value: option,
        label: option.label,
        description: t("memoryPolicies.contentManager.targetDescription", {
          id: option.id,
          count: option.memoryCount,
        }),
      })),
    [t, targetOptions],
  );
  const selectedTargetDisplay = useMemo(
    () =>
      selectedTarget
        ? {
            label: selectedTarget.label,
            description: t("memoryPolicies.contentManager.targetDescription", {
              id: selectedTarget.id,
              count: selectedTarget.memoryCount,
            }),
          }
        : null,
    [selectedTarget, t],
  );
  const selectedStatusDisplay = useMemo(
    () => ({
      label:
        MEMORY_STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ??
        statusFilter,
    }),
    [statusFilter],
  );
  const selectTarget = useCallback((option: MemoryContentTargetOption) => {
    if (option.scope.type === "global") return;
    setSelectedIds((current) => ({ ...current, [option.scope.type]: option.id }));
  }, []);
  const emptyText = useMemo(() => {
    if (!selectedScope) return t("memoryPolicies.contentManager.selectTargetFirst");
    if (memory.details.length === 0) return t("memoryPolicies.contentManager.empty");
    return t("memoryPolicies.contentManager.noMatches");
  }, [memory.details.length, selectedScope, t]);

  return (
    <SettingsSection title={t("memoryPolicies.contentManager.title")}>
      <Text style={settingsStyles.rowHint}>{t("memoryPolicies.contentManager.description")}</Text>
      <View style={settingsStyles.card}>
        <View style={styles.filters}>
          <View style={styles.selector}>
            <SelectField
              label={t("memoryPolicies.scopeManager.scopeType")}
              value={scopeType}
              selectedDisplay={selectedScopeDisplay}
              options={scopeTypeOptions}
              onChange={onScopeFilterChange}
              placeholder={t("memoryPolicies.scopeManager.selectScopeType")}
              emptyText={t("memoryPolicies.scopeManager.noScopes")}
            />
          </View>
          {scopeType === "global" ? null : (
            <View style={styles.selector}>
              <SelectField
                label={t("memoryPolicies.scopeManager.target")}
                value={selectedTarget}
                selectedDisplay={selectedTargetDisplay}
                options={targetSelectOptions}
                onChange={selectTarget}
                getValueKey={optionKey}
                searchable
                loading={scopeType === "assistant" && assistants.isLoading}
                placeholder={t("memoryPolicies.scopeManager.selectTarget")}
                emptyText={t("memoryPolicies.scopeManager.noTargets")}
              />
            </View>
          )}
          <View style={styles.search}>
            <Field label={t("memoryPolicies.contentManager.search")}>
              <FormTextInput
                value={search}
                onChangeText={onSearchChange}
                placeholder={t("memoryPolicies.contentManager.searchPlaceholder")}
              />
            </Field>
          </View>
          <View style={styles.status}>
            <SelectField
              label={t("memoryPolicies.contentManager.status")}
              value={statusFilter}
              selectedDisplay={selectedStatusDisplay}
              options={MEMORY_STATUS_OPTIONS}
              onChange={onStatusFilterChange}
              placeholder={t("memoryPolicies.contentManager.allStatuses")}
              emptyText={t("memoryPolicies.contentManager.noStatuses")}
            />
          </View>
        </View>
      </View>

      {selectedScope ? (
        <MemoryCreateCard
          disabled={isMutating}
          globalUserId={memory.activeUserId ?? memory.users?.[0]?.id ?? "default"}
          scope={selectedScope}
          onCreate={onCreateDetail}
        />
      ) : null}

      {visibleDetails.length === 0 ? (
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>{emptyText}</Text>
          </View>
        </View>
      ) : (
        visibleDetails.map((detail) => (
          <MemoryDetailCard
            key={detail.id}
            detail={detail}
            disabled={isMutating}
            onSave={onSaveDetail}
            onDelete={onDeleteDetail}
          />
        ))
      )}
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
  selector: {
    flex: 1,
    minWidth: 220,
  },
  search: {
    flex: 2,
    minWidth: 240,
  },
  status: {
    flex: 1,
    minWidth: 160,
  },
}));
