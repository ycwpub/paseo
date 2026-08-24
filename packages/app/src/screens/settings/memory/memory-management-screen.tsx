import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemoryScope,
} from "@getpaseo/protocol/messages";
import { BackHeader } from "@/components/headers/back-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { useAssistants } from "@/hooks/use-assistants";
import { useMemory } from "@/hooks/use-memory";
import { useProjects } from "@/hooks/use-projects";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  buildHostMemoryDetailRoute,
  buildHostMemoryRoute,
  buildProjectMemoryDetailRoute,
  buildProjectMemoryRoute,
  buildProjectSettingsRoute,
  buildSettingsHostSectionRoute,
} from "@/utils/host-routes";
import {
  buildMemoryContentTargetOptions,
  memoryDetailMatchesScope,
  type MemoryContentTargetOption,
} from "./memory-content-manager-model";
import { MemoryCreateCard } from "./memory-create-card";
import { memoryDetailEdit, type MemoryDetailDraft } from "./memory-detail-draft";
import { MemoryDetailPage } from "./memory-detail-page";
import { MemoryDetailRow } from "./memory-detail-row";
import { MEMORY_STATUS_OPTIONS, type MemoryStatusFilter } from "./memory-form-options";
import { DEFAULT_MEMORY_PAGE_SIZE, paginateMemoryItems } from "./memory-pagination";
import { MemoryPaginationControls } from "./memory-pagination-controls";
import type { MemoryScopeEntity } from "./memory-scope-policy-options";
import { filterMemoryDetails } from "./memory-view-model";

type ManagedScopeType = "global" | "project" | "assistant";

const HOST_SCOPE_TYPES: ManagedScopeType[] = ["global", "project", "assistant"];
const PROJECT_SCOPE_TYPES: ManagedScopeType[] = ["project"];

function optionKey(option: MemoryContentTargetOption): string {
  return `${option.scope.type}:${option.scope.id}`;
}

export function MemoryManagementScreen({
  serverId,
  projectId,
  memoryId,
}: {
  serverId: string;
  projectId?: string;
  memoryId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { memory, isLoading, error, updateMemory, isMutating, mutationError } = useMemory(serverId);
  const assistantsSupported = useHostFeature(serverId, "assistants");
  const assistants = useAssistants(serverId, {
    enabled: assistantsSupported && !projectId,
  });
  const listRoute = projectId
    ? buildProjectMemoryRoute(serverId, projectId)
    : buildHostMemoryRoute(serverId);
  const settingsRoute = projectId
    ? buildProjectSettingsRoute(serverId, projectId)
    : buildSettingsHostSectionRoute(serverId, "memory");
  const goBack = useCallback(() => {
    router.navigate(memoryId ? listRoute : settingsRoute);
  }, [listRoute, memoryId, router, settingsRoute]);
  const insetBottomStyle = useMemo(() => ({ paddingBottom: insets.bottom + 24 }), [insets.bottom]);
  const saveDetail = useCallback(
    async (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => {
      if (!memory) return;
      await updateMemory({
        detailEdits: [
          memoryDetailEdit({
            detail,
            draft,
            globalUserId: memory.activeUserId ?? memory.users?.[0]?.id ?? "default",
          }),
        ],
      });
    },
    [memory, updateMemory],
  );
  const deleteDetail = useCallback(
    async (detail: PaseoMemoryDetail) => {
      const confirmed = await confirmDialog({
        title: t("settings.project.memory.content.deleteTitle", {
          title: detail.title,
        }),
        message: t("settings.project.memory.content.deleteDescription"),
        confirmLabel: t("settings.project.memory.content.deleteConfirm"),
        destructive: true,
      });
      if (!confirmed) return;
      await updateMemory({ deleteDetailIds: [detail.id] });
      router.replace(listRoute);
    },
    [listRoute, router, t, updateMemory],
  );
  const createDetail = useCallback(
    async (input: PaseoMemoryCreateInput) => {
      await updateMemory({ createDetails: [input] });
    },
    [updateMemory],
  );
  const openDetail = useCallback(
    (detail: PaseoMemoryDetail) => {
      router.push(
        projectId
          ? buildProjectMemoryDetailRoute(serverId, projectId, detail.id)
          : buildHostMemoryDetailRoute(serverId, detail.id),
      );
    },
    [projectId, router, serverId],
  );

  if (isLoading || !memory) {
    return (
      <View style={styles.container}>
        <BackHeader title={t("memoryPolicies.contentManager.pageTitle")} onBack={goBack} />
        <View style={styles.centered}>
          <Text style={settingsStyles.rowHint}>
            {error?.message ?? t("memoryPolicies.contentManager.loading")}
          </Text>
        </View>
      </View>
    );
  }

  const visibleError = mutationError?.message ?? error?.message ?? null;
  const selectedDetail = memoryId
    ? (memory.details.find((detail) => detail.id === memoryId) ?? null)
    : null;
  let pageContent: ReactNode;
  if (!memoryId) {
    pageContent = (
      <MemoryListPage
        serverId={serverId}
        projectId={projectId}
        memory={memory}
        assistants={assistants.assistants}
        assistantsLoading={assistants.isLoading}
        disabled={isMutating}
        onCreate={createDetail}
        onOpen={openDetail}
      />
    );
  } else if (selectedDetail) {
    pageContent = (
      <MemoryDetailPage
        detail={selectedDetail}
        scopeEditable={!projectId}
        disabled={isMutating}
        onSave={saveDetail}
        onDelete={deleteDetail}
      />
    );
  } else {
    pageContent = (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("memoryPolicies.contentManager.notFound")}
            </Text>
          </View>
          <Button size="sm" variant="outline" onPress={goBack}>
            {t("memoryPolicies.contentManager.backToList")}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader
        title={
          memoryId
            ? t("memoryPolicies.contentManager.detailTitle")
            : t("memoryPolicies.contentManager.pageTitle")
        }
        onBack={goBack}
      />
      <ScrollView style={styles.scrollView} contentContainerStyle={insetBottomStyle}>
        <View style={styles.content}>
          {visibleError ? (
            <Alert
              variant="error"
              title={t("memoryPolicies.contentManager.errorTitle")}
              description={visibleError}
            />
          ) : null}
          {pageContent}
        </View>
      </ScrollView>
    </View>
  );
}

function MemoryListPage({
  serverId,
  projectId,
  memory,
  assistants,
  assistantsLoading,
  disabled,
  onCreate,
  onOpen,
}: {
  serverId: string;
  projectId?: string;
  memory: NonNullable<ReturnType<typeof useMemory>["memory"]>;
  assistants: readonly { id: string; name: string; description: string }[];
  assistantsLoading: boolean;
  disabled: boolean;
  onCreate: (input: PaseoMemoryCreateInput) => Promise<void>;
  onOpen: (detail: PaseoMemoryDetail) => void;
}) {
  const { t } = useTranslation();
  const { projects } = useProjects();
  const [scopeType, setScopeType] = useState<ManagedScopeType>(projectId ? "project" : "global");
  const [selectedIds, setSelectedIds] = useState<
    Partial<Record<Exclude<ManagedScopeType, "global">, string>>
  >({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MemoryStatusFilter>(projectId ? "all" : "active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_MEMORY_PAGE_SIZE);
  const scopeTypes = projectId ? PROJECT_SCOPE_TYPES : HOST_SCOPE_TYPES;

  const entities = useMemo(() => {
    const projectEntities: MemoryScopeEntity[] = [];
    for (const project of projects) {
      for (const host of project.hosts) {
        if (host.serverId !== serverId) continue;
        projectEntities.push({
          id: host.projectId,
          label: host.projectCustomName ?? host.projectName,
          description: host.repoRoot,
        });
      }
    }
    return {
      projects: projectEntities,
      assistants: assistants.map((assistant) => ({
        id: assistant.id,
        label: assistant.name.trim() || assistant.id,
        description: assistant.description.trim() || undefined,
      })),
    };
  }, [assistants, projects, serverId]);
  const targetOptionsByType = useMemo(
    () => buildMemoryContentTargetOptions({ ...entities, details: memory.details }),
    [entities, memory.details],
  );
  const targetOptions = useMemo(() => {
    if (scopeType === "global" || (scopeType === "project" && projectId)) return [];
    return targetOptionsByType[scopeType];
  }, [projectId, scopeType, targetOptionsByType]);
  const selectedTarget = useMemo(
    () =>
      scopeType === "global" || (scopeType === "project" && projectId)
        ? null
        : (targetOptions.find((option) => option.id === selectedIds[scopeType]) ??
          targetOptions[0] ??
          null),
    [projectId, scopeType, selectedIds, targetOptions],
  );
  const selectedScope = useMemo<PaseoMemoryScope | null>(() => {
    if (scopeType === "global") {
      return {
        type: "global",
        id: memory.activeUserId ?? memory.users?.[0]?.id ?? "default",
      };
    }
    if (scopeType === "project" && projectId) return { type: "project", id: projectId };
    return selectedTarget?.scope ?? null;
  }, [memory.activeUserId, memory.users, projectId, scopeType, selectedTarget]);
  const visibleDetails = useMemo(
    () =>
      filterMemoryDetails({
        details: memory.details.filter((detail) => memoryDetailMatchesScope(detail, selectedScope)),
        search,
        status,
        scope: "all",
      }),
    [memory.details, search, selectedScope, status],
  );
  const pagination = useMemo(
    () => paginateMemoryItems(visibleDetails, page, pageSize),
    [page, pageSize, visibleDetails],
  );
  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  const scopeOptions = useMemo<SelectFieldOption<ManagedScopeType>[]>(
    () =>
      scopeTypes.map((type) => ({
        id: type,
        value: type,
        label: t(`memoryPolicies.scopeManager.types.${type}`),
      })),
    [scopeTypes, t],
  );
  const scopeDisplay = useMemo(
    () => ({ label: t(`memoryPolicies.scopeManager.types.${scopeType}`) }),
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
  const statusDisplay = useMemo(
    () => ({
      label: MEMORY_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status,
    }),
    [status],
  );
  const changeScope = useCallback((value: ManagedScopeType) => {
    setScopeType(value);
    setPage(1);
  }, []);
  const changeTarget = useCallback((option: MemoryContentTargetOption) => {
    if (option.scope.type === "global") return;
    setSelectedIds((current) => ({ ...current, [option.scope.type]: option.id }));
    setPage(1);
  }, []);
  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);
  const changeStatus = useCallback((value: MemoryStatusFilter) => {
    setStatus(value);
    setPage(1);
  }, []);
  const changePageSize = useCallback((value: number) => {
    setPageSize(value);
    setPage(1);
  }, []);
  let emptyText = t("memoryPolicies.contentManager.noMatches");
  if (!selectedScope) {
    emptyText = t("memoryPolicies.contentManager.selectTargetFirst");
  } else if (memory.details.length === 0) {
    emptyText = t("memoryPolicies.contentManager.empty");
  }
  const showTarget = scopeType !== "global" && !(scopeType === "project" && projectId);

  return (
    <SettingsSection title={t("memoryPolicies.contentManager.title")}>
      <Text style={settingsStyles.rowHint}>{t("memoryPolicies.contentManager.description")}</Text>
      <View style={settingsStyles.card}>
        <View style={styles.filters}>
          <View style={styles.selector}>
            <SelectField
              label={t("memoryPolicies.scopeManager.scopeType")}
              value={scopeType}
              selectedDisplay={scopeDisplay}
              options={scopeOptions}
              onChange={changeScope}
              placeholder={t("memoryPolicies.scopeManager.selectScopeType")}
              emptyText={t("memoryPolicies.scopeManager.noScopes")}
            />
          </View>
          {showTarget ? (
            <View style={styles.selector}>
              <SelectField
                label={t("memoryPolicies.scopeManager.target")}
                value={selectedTarget}
                selectedDisplay={selectedTargetDisplay}
                options={targetSelectOptions}
                onChange={changeTarget}
                getValueKey={optionKey}
                searchable
                loading={scopeType === "assistant" && assistantsLoading}
                placeholder={t("memoryPolicies.scopeManager.selectTarget")}
                emptyText={t("memoryPolicies.scopeManager.noTargets")}
              />
            </View>
          ) : null}
          <View style={styles.search}>
            <Field label={t("memoryPolicies.contentManager.search")}>
              <FormTextInput
                value={search}
                onChangeText={changeSearch}
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
              onChange={changeStatus}
              placeholder={t("memoryPolicies.contentManager.allStatuses")}
              emptyText={t("memoryPolicies.contentManager.noStatuses")}
            />
          </View>
        </View>
      </View>

      {selectedScope ? (
        <MemoryCreateCard
          disabled={disabled}
          globalUserId={memory.activeUserId ?? memory.users?.[0]?.id ?? "default"}
          scope={selectedScope}
          onCreate={onCreate}
        />
      ) : null}

      {pagination.items.length === 0 ? (
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>{emptyText}</Text>
          </View>
        </View>
      ) : (
        pagination.items.map((detail) => (
          <MemoryDetailRow key={detail.id} detail={detail} onPress={onOpen} />
        ))
      )}

      <View style={styles.paginationCard}>
        <MemoryPaginationControls
          pagination={pagination}
          disabled={disabled}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  content: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    padding: theme.spacing[4],
    paddingTop: theme.spacing[6],
  },
  filters: {
    padding: theme.spacing[4],
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  selector: {
    flex: 1,
    minWidth: 210,
  },
  search: {
    flex: 2,
    minWidth: 240,
  },
  status: {
    flex: 1,
    minWidth: 150,
  },
  paginationCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[3],
  },
}));
