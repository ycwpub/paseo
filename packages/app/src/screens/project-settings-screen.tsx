import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Pencil, Plus } from "lucide-react-native";
import { ProjectIconView } from "@/components/project-icon-view";
import type {
  PaseoConfigRaw,
  PaseoConfigRevision,
  ProjectConfigRpcError,
} from "@getpaseo/protocol/messages";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert } from "@/components/ui/alert";
import { ExternalLink } from "@/components/ui/external-link";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { ProjectEditSheet } from "@/components/project-edit-sheet";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useProjects } from "@/hooks/use-projects";
import type { ProjectEditFormSnapshot } from "@/projects/edit-form";
import { useProjectIcons } from "@/projects/icons";
import { useHostRuntimeClient, useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { useToast } from "@/contexts/toast-context";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  applyDraftToConfig,
  configToDraft,
  METADATA_PROMPT_KEYS,
  projectDirectoryPathForDisplay,
  type LifecycleOriginalKind,
  type MetadataPromptKey,
  type ProjectConfigDraft,
  type ProjectDirectoryDraft,
  type ProjectDirectoryKey,
  type ProjectScriptDraft,
  type ProjectVariableDraft,
} from "@/utils/project-config-form";
import { buildProjectsSettingsRoute } from "@/utils/host-routes";
import {
  getProjectHostEntry,
  getProjectSummaryForHostProject,
  type ProjectHostEntry,
  type ProjectSummary,
} from "@/utils/projects";

const SCRIPT_SERVICE_TYPE = "service";

const ICON_SIZE = 14;

interface MetadataPromptField {
  titleKey: string;
  placeholderKey: string;
  sectionTestID: string;
  inputTestID: string;
}

const METADATA_PROMPT_FIELDS: Record<MetadataPromptKey, MetadataPromptField> = {
  branchName: {
    titleKey: "settings.project.metadata.branchName",
    placeholderKey: "settings.project.metadata.branchNamePlaceholder",
    sectionTestID: "metadata-prompt-branch-name-section",
    inputTestID: "metadata-prompt-branch-name-input",
  },
  commitMessage: {
    titleKey: "settings.project.metadata.commitMessage",
    placeholderKey: "settings.project.metadata.commitMessagePlaceholder",
    sectionTestID: "metadata-prompt-commit-message-section",
    inputTestID: "metadata-prompt-commit-message-input",
  },
  pullRequest: {
    titleKey: "settings.project.metadata.pullRequest",
    placeholderKey: "settings.project.metadata.pullRequestPlaceholder",
    sectionTestID: "metadata-prompt-pull-request-section",
    inputTestID: "metadata-prompt-pull-request-input",
  },
};

const WORKTREE_DOCS_URL = "https://paseo.sh/docs/worktrees";

type ReadProjectConfigData = Awaited<ReturnType<DaemonClient["readProjectConfig"]>>;

export interface ProjectSettingsScreenProps {
  serverId: string;
  projectId: string;
}

export default function ProjectSettingsScreen({ serverId, projectId }: ProjectSettingsScreenProps) {
  const { projects } = useProjects();
  const project = useMemo(
    () => getProjectSummaryForHostProject(projects, serverId, projectId),
    [projectId, projects, serverId],
  );
  const selectedHost = getProjectHostEntry(project, serverId, projectId);
  const selectedSnapshot = useHostRuntimeSnapshot(serverId);
  const isHostGone =
    Boolean(serverId) &&
    (selectedSnapshot?.connectionStatus === "offline" ||
      selectedSnapshot?.connectionStatus === "error");

  const client = useHostRuntimeClient(serverId);
  const canEdit =
    selectedHost?.isOnline === true &&
    selectedHost.serverId.trim().length > 0 &&
    selectedHost.repoRoot.trim().length > 0;

  if (!project || !selectedHost || !client || !canEdit) {
    return <NoEditableTarget serverId={serverId} />;
  }

  return (
    <ProjectSettingsBody
      project={project}
      selectedHost={selectedHost}
      client={client}
      isHostGone={isHostGone}
    />
  );
}

function navigateBackToProjects(serverId: string) {
  router.navigate(buildProjectsSettingsRoute(serverId));
}

function NoEditableTarget({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const handleBack = useCallback(() => navigateBackToProjects(serverId), [serverId]);
  return (
    <View style={styles.noTargetContainer}>
      <BackToProjectsButton serverId={serverId} />
      <Text style={styles.noTargetText}>{t("settings.project.noEditableTarget")}</Text>
      <Button
        testID="project-settings-back-button"
        onPress={handleBack}
        variant="secondary"
        size="md"
      >
        {t("settings.project.backToProjects")}
      </Button>
    </View>
  );
}

function BackToProjectsButton({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const handleBack = useCallback(() => navigateBackToProjects(serverId), [serverId]);
  return (
    <Button
      testID="project-settings-back-link"
      accessibilityLabel={t("settings.project.backToProjects")}
      onPress={handleBack}
      variant="ghost"
      size="sm"
      leftIcon={ArrowLeft}
      style={styles.backButton}
    >
      {t("settings.project.backToProjects")}
    </Button>
  );
}

interface ProjectSettingsBodyProps {
  project: ProjectSummary;
  selectedHost: ProjectHostEntry;
  client: DaemonClient;
  isHostGone: boolean;
}

function ProjectSettingsBody({
  project,
  selectedHost,
  client,
  isHostGone,
}: ProjectSettingsBodyProps) {
  const { t } = useTranslation();
  const queryKey = useMemo(
    () => ["project-config", selectedHost.serverId, selectedHost.repoRoot] as const,
    [selectedHost.serverId, selectedHost.repoRoot],
  );

  const readQuery = useQuery({
    queryKey,
    queryFn: () => client.readProjectConfig(selectedHost.repoRoot),
    retry: false,
  });

  const data = readQuery.data;
  const supportsCustomIcon = useHostFeature(selectedHost.serverId, "projectCustomIcon");
  const customIconRevision = selectedHost.customIconRevision ?? null;
  const projectIconTargets = useMemo(
    () => [
      {
        serverId: selectedHost.serverId,
        projectViewKey: project.viewKey,
        projectId: selectedHost.projectId,
        iconWorkingDir: selectedHost.repoRoot,
        customIconRevision,
      },
    ],
    [
      customIconRevision,
      project.viewKey,
      selectedHost.projectId,
      selectedHost.repoRoot,
      selectedHost.serverId,
    ],
  );
  const projectIcons = useProjectIcons({ projects: projectIconTargets });
  const projectIconDataUri = projectIcons.get(project.viewKey) ?? null;
  const editSnapshot = useMemo<ProjectEditFormSnapshot>(
    () => ({
      projectName: selectedHost.projectName,
      projectCustomName: selectedHost.projectCustomName,
      hasCustomIcon: customIconRevision !== null,
      currentIconDataUri: projectIconDataUri,
    }),
    [
      customIconRevision,
      projectIconDataUri,
      selectedHost.projectCustomName,
      selectedHost.projectName,
    ],
  );
  const loadedConfig: PaseoConfigRaw | null = data?.ok ? (data.config ?? {}) : null;
  const loadedRevision: PaseoConfigRevision | null = data?.ok ? data.revision : null;
  const readError: ProjectConfigRpcError | null = data && !data.ok ? data.error : null;

  const handleReload = useCallback(() => {
    void readQuery.refetch();
  }, [readQuery]);

  return (
    <View role="main" style={styles.body}>
      <BackToProjectsButton serverId={selectedHost.serverId} />

      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          <ProjectTitleIcon
            iconDataUri={projectIconDataUri}
            projectName={selectedHost.projectName}
            projectViewKey={project.viewKey}
          />
          <Text style={styles.projectTitle} numberOfLines={1}>
            {selectedHost.projectName}
          </Text>
          <Pressable
            testID="project-edit-button"
            accessibilityRole="button"
            accessibilityLabel={t("settings.project.edit.title")}
            onPress={openEditSheet}
            hitSlop={8}
            style={styles.editButton}
          >
            <Pencil size={ICON_SIZE} color={styles.iconColor.color} />
          </Pressable>
        </View>
        <Text style={styles.projectId} selectable>
          {t("settings.project.projectId")}: {project.projectKey}
        </Text>
        <HostContext hosts={hosts} selectedHost={selectedHost} onSelectHost={onSelectHost} />
      </View>

      <ProjectEditSheet
        // A new instance per open seeds the form from the project as it stands now.
        key={`${selectedHost.serverId}:${selectedHost.projectId}:${editSessionId}`}
        visible={isEditSheetOpen}
        onClose={closeEditSheet}
        serverId={selectedHost.serverId}
        projectId={selectedHost.projectId}
        projectViewKey={project.viewKey}
        client={client}
        supportsCustomIcon={supportsCustomIcon}
        snapshot={editSnapshot}
      />

      {renderContent({
        readQuery,
        loadedConfig,
        loadedRevision,
        readError,
        selectedHost,
        queryKey,
        client,
        onReload: handleReload,
        isHostGone,
      })}
    </View>
  );
}

interface RenderContentInput {
  readQuery: ReturnType<typeof useQuery<ReadProjectConfigData>>;
  loadedConfig: PaseoConfigRaw | null;
  loadedRevision: PaseoConfigRevision | null;
  readError: ProjectConfigRpcError | null;
  selectedHost: ProjectHostEntry;
  queryKey: readonly [string, string, string];
  client: DaemonClient;
  onReload: () => void;
  isHostGone: boolean;
}

function renderContent({
  readQuery,
  loadedConfig,
  loadedRevision,
  readError,
  selectedHost,
  queryKey,
  client,
  onReload,
  isHostGone,
}: RenderContentInput) {
  if (readQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={ResolveSpinnerColor()} />
      </View>
    );
  }

  if (readQuery.isError) {
    return <ReadFailureCallout kind="transport" error={readQuery.error} onReload={onReload} />;
  }

  if (readError) {
    return <ReadFailureCallout kind={readError.code} error={null} onReload={onReload} />;
  }

  if (isHostGone) {
    return <NoEditableTarget serverId={selectedHost.serverId} />;
  }

  if (!loadedConfig) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={ResolveSpinnerColor()} />
      </View>
    );
  }

  const formKey = `${selectedHost.serverId}::${selectedHost.repoRoot}::${revisionToKey(loadedRevision)}`;
  return (
    <ProjectConfigForm
      key={formKey}
      baseConfig={loadedConfig}
      revision={loadedRevision}
      repoRoot={selectedHost.repoRoot}
      serverId={selectedHost.serverId}
      queryKey={queryKey}
      client={client}
      onReload={onReload}
    />
  );
}

function revisionToKey(revision: PaseoConfigRevision | null): string {
  if (!revision) return "none";
  return `${revision.mtimeMs}-${revision.size}`;
}

interface ReadFailureCalloutProps {
  kind: "transport" | ProjectConfigRpcError["code"];
  error: unknown;
  onReload: () => void;
}

function ReadFailureCallout({ kind, error, onReload }: ReadFailureCalloutProps) {
  const { t } = useTranslation();
  const { testID, title, description } = resolveReadFailureCopy({
    kind,
    error,
    t,
  });
  return (
    <View style={styles.errorBlock}>
      <Alert testID={testID} variant="error" title={title} description={description}>
        <Button testID={`${testID}-action-0`} onPress={onReload} variant="outline" size="sm">
          {t("settings.project.actions.reload")}
        </Button>
      </Alert>
    </View>
  );
}

function resolveReadFailureCopy(input: {
  kind: ReadFailureCalloutProps["kind"];
  error: unknown;
  t: TFunction;
}): { testID: string; title: string; description: string } {
  if (input.kind === "invalid_project_config") {
    return {
      testID: "invalid-callout",
      title: input.t("settings.project.readFailures.invalidTitle"),
      description: input.t("settings.project.readFailures.invalidDescription"),
    };
  }
  if (input.kind === "project_not_found") {
    return {
      testID: "project-not-found-callout",
      title: input.t("settings.project.readFailures.missingTitle"),
      description: input.t("settings.project.readFailures.missingSingleHost"),
    };
  }
  if (input.kind === "transport") {
    const detail = errorToDetail(input.error);
    return {
      testID: "read-transport-callout",
      title: input.t("settings.project.readFailures.transportTitle"),
      description: detail ?? input.t("settings.project.readFailures.transportFallback"),
    };
  }
  return {
    testID: "read-failed-callout",
    title: input.t("settings.project.readFailures.failedTitle"),
    description: input.t("settings.project.readFailures.failedDescription"),
  };
}

function errorToDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return null;
}

interface ProjectConfigFormProps {
  baseConfig: PaseoConfigRaw;
  revision: PaseoConfigRevision | null;
  repoRoot: string;
  serverId: string;
  queryKey: readonly [string, string, string];
  client: DaemonClient;
  onReload: () => void;
}

function ProjectConfigForm({
  baseConfig,
  revision,
  repoRoot,
  serverId,
  queryKey,
  client,
  onReload,
}: ProjectConfigFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { config: daemonConfig, patchConfig } = useDaemonConfig(serverId);

  const [draft, setDraft] = useState<ProjectConfigDraft>(() => configToDraft(baseConfig));
  const [writeError, setWriteError] = useState<ProjectConfigRpcError | null>(null);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const globalIndexInterval = daemonConfig?.projectIndexing.updateIntervalMinutes ?? 1440;
  const [globalIndexIntervalText, setGlobalIndexIntervalText] = useState(
    String(globalIndexInterval),
  );

  useEffect(() => {
    setGlobalIndexIntervalText(String(globalIndexInterval));
  }, [globalIndexInterval]);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      config: PaseoConfigRaw;
      expectedRevision: PaseoConfigRevision | null;
    }) => {
      return client.writeProjectConfig({
        repoRoot,
        config: input.config,
        expectedRevision: input.expectedRevision,
      });
    },
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.setQueryData<ReadProjectConfigData>(queryKey, {
          ok: true,
          config: result.config,
          revision: result.revision,
          requestId: "local-cache",
          repoRoot,
        });
        setWriteError(null);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        toast.show(t("settings.project.actions.saved"), { variant: "success" });
      } else {
        setWriteError(result.error);
      }
    },
  });

  const handleSave = useCallback(() => {
    if (writeError?.code === "stale_project_config") return;
    const config = applyDraftToConfig({ draft, base: baseConfig });
    saveMutation.mutate({
      config,
      expectedRevision: revision,
    });
  }, [draft, baseConfig, revision, writeError, saveMutation]);

  const handleReload = useCallback(() => {
    setWriteError(null);
    onReload();
  }, [onReload]);

  const updateDraft = useCallback((updater: (draft: ProjectConfigDraft) => ProjectConfigDraft) => {
    setDraft((prev) => updater(prev));
  }, []);

  const handleSetupChange = useCallback(
    (text: string) => updateDraft((d) => ({ ...d, setupText: text })),
    [updateDraft],
  );
  const handleTeardownChange = useCallback(
    (text: string) => updateDraft((d) => ({ ...d, teardownText: text })),
    [updateDraft],
  );

  const handleMetadataPromptChange = useCallback(
    (key: MetadataPromptKey, text: string) =>
      updateDraft((d) => ({
        ...d,
        metadataPrompts: { ...d.metadataPrompts, [key]: text },
      })),
    [updateDraft],
  );

  const handleDirectoryChange = useCallback(
    (key: ProjectDirectoryKey, values: ProjectDirectoryDraft[]) =>
      updateDraft((d) => ({
        ...d,
        projectDirectories: { ...d.projectDirectories, [key]: values },
      })),
    [updateDraft],
  );
  const handleDirectoryModeChange = useCallback(
    (projectDirectoryMode: "single" | "multiple") =>
      updateDraft((d) => ({
        ...d,
        projectDirectoryMode,
        projectDirectories:
          projectDirectoryMode === "single"
            ? {
                ...d.projectDirectories,
                project: d.projectDirectories.project.slice(0, 1),
              }
            : d.projectDirectories,
      })),
    [updateDraft],
  );

  const handleIndexAutoGenerateChange = useCallback(
    (value: boolean) => updateDraft((d) => ({ ...d, projectIndexAutoGenerate: value })),
    [updateDraft],
  );

  const handleProjectIndexIntervalChange = useCallback(
    (value: string) => updateDraft((d) => ({ ...d, projectIndexUpdateIntervalText: value })),
    [updateDraft],
  );

  const handleVariablesChange = useCallback(
    (projectVariables: ProjectVariableDraft[]) => updateDraft((d) => ({ ...d, projectVariables })),
    [updateDraft],
  );

  const handleSaveGlobalIndexInterval = useCallback(() => {
    const parsed = Number(globalIndexIntervalText.trim());
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return;
    void patchConfig({ projectIndexing: { updateIntervalMinutes: parsed } }).catch((error) => {
      toast.show(error instanceof Error ? error.message : String(error), { variant: "error" });
    });
  }, [globalIndexIntervalText, patchConfig, toast]);

  const handleRemoveScript = useCallback(
    async (script: ProjectScriptDraft) => {
      const ok = await confirmDialog({
        title: t("settings.project.scripts.removeTitle"),
        message: t("settings.project.scripts.removeMessage", {
          name: script.name || t("settings.project.scripts.removeFallbackName"),
        }),
        confirmLabel: t("settings.project.scripts.actions.remove"),
        cancelLabel: t("settings.project.actions.cancel"),
        destructive: true,
      });
      if (!ok) return;
      updateDraft((d) => ({
        ...d,
        scripts: d.scripts.filter((entry) => entry.id !== script.id),
      }));
    },
    [t, updateDraft],
  );

  const handleEditScript = useCallback((script: ProjectScriptDraft) => {
    setEditingScriptId(script.id);
  }, []);

  const handleAddScript = useCallback(() => {
    const id = `script-draft-new-${Date.now()}`;
    updateDraft((d) => ({
      ...d,
      scripts: [
        ...d.scripts,
        {
          id,
          name: "",
          commandText: "",
          commandOriginalKind: "missing" satisfies LifecycleOriginalKind,
          type: "",
          portText: "",
          rawEntry: {},
        },
      ],
    }));
    setEditingScriptId(id);
  }, [updateDraft]);

  const handleEditingDraftChange = useCallback(
    (next: ProjectScriptDraft) => {
      updateDraft((d) => ({
        ...d,
        scripts: d.scripts.map((entry) => (entry.id === next.id ? next : entry)),
      }));
    },
    [updateDraft],
  );

  const handleCancelEditing = useCallback(() => {
    if (!editingScriptId) {
      return;
    }
    updateDraft((d) => {
      const entry = d.scripts.find((row) => row.id === editingScriptId);
      if (!entry) return d;
      const isEmpty =
        entry.name.trim().length === 0 &&
        entry.commandText.trim().length === 0 &&
        entry.type.trim().length === 0 &&
        entry.portText.trim().length === 0;
      if (!isEmpty) return d;
      return { ...d, scripts: d.scripts.filter((row) => row.id !== editingScriptId) };
    });
    setEditingScriptId(null);
  }, [editingScriptId, updateDraft]);

  const handleSaveEditing = useCallback(() => {
    setEditingScriptId(null);
  }, []);

  const editingScript = draft.scripts.find((entry) => entry.id === editingScriptId);

  const hasInvalidScripts = useMemo(
    () => draft.scripts.some((script) => validateScript(script, t).hasErrors),
    [draft.scripts, t],
  );
  const projectValidation = useMemo(() => validateProjectConfiguration(draft, t), [draft, t]);

  const scriptsTrailing = useMemo(
    () => (
      <Pressable
        onPress={handleAddScript}
        hitSlop={8}
        style={settingsStyles.sectionHeaderLink}
        accessibilityRole="button"
        accessibilityLabel={t("settings.project.scripts.actions.add")}
        testID="scripts-add-button"
      >
        <Plus size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
    ),
    [handleAddScript, t],
  );

  const setupDocsLink = useMemo(
    () => (
      <ExternalLink
        href={WORKTREE_DOCS_URL}
        label={t("settings.project.worktree.docs")}
        tooltip={t("settings.project.worktree.docsTooltip")}
        testID="worktree-setup-docs-link"
      />
    ),
    [t],
  );
  const teardownDocsLink = useMemo(
    () => (
      <ExternalLink
        href={WORKTREE_DOCS_URL}
        label={t("settings.project.worktree.docs")}
        tooltip={t("settings.project.worktree.docsTooltip")}
        testID="worktree-teardown-docs-link"
      />
    ),
    [t],
  );

  const isStale = writeError?.code === "stale_project_config";
  const isWriteFailed = writeError?.code === "write_failed";
  const saveDisabled =
    saveMutation.isPending || isStale || hasInvalidScripts || projectValidation.hasErrors;

  return (
    <View>
      <ProjectResourcesEditor
        draft={draft}
        projectDirectoryPath={repoRoot}
        globalIndexInterval={globalIndexInterval}
        globalIndexIntervalText={globalIndexIntervalText}
        validation={projectValidation}
        onDirectoryModeChange={handleDirectoryModeChange}
        onDirectoryChange={handleDirectoryChange}
        onIndexAutoGenerateChange={handleIndexAutoGenerateChange}
        onProjectIndexIntervalChange={handleProjectIndexIntervalChange}
        onGlobalIndexIntervalChange={setGlobalIndexIntervalText}
        onSaveGlobalIndexInterval={handleSaveGlobalIndexInterval}
        onVariablesChange={handleVariablesChange}
      />

      <SettingsGroup
        title={t("settings.project.worktree.title")}
        info={t("settings.project.worktree.info")}
        testID="worktree-group"
      >
        <SettingsSection
          title={t("settings.project.worktree.setup")}
          testID="worktree-setup-section"
          trailing={setupDocsLink}
        >
          <SettingsTextAreaCard
            testID="worktree-setup-input"
            accessibilityLabel={t("settings.project.worktree.setupAccessibility")}
            value={draft.setupText}
            onChangeText={handleSetupChange}
            placeholder="npm install"
          />
        </SettingsSection>

        <SettingsSection
          title={t("settings.project.worktree.teardown")}
          testID="worktree-teardown-section"
          trailing={teardownDocsLink}
          flush
        >
          <SettingsTextAreaCard
            testID="worktree-teardown-input"
            accessibilityLabel={t("settings.project.worktree.teardownAccessibility")}
            value={draft.teardownText}
            onChangeText={handleTeardownChange}
            placeholder="docker compose down"
          />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup
        title={t("settings.project.scripts.title")}
        info={t("settings.project.scripts.info")}
        trailing={scriptsTrailing}
        testID="scripts-group"
      >
        <View style={settingsStyles.card} testID="scripts-list">
          {draft.scripts.length === 0 ? (
            <View style={settingsStyles.row}>
              <Text style={styles.emptyScripts}>{t("settings.project.scripts.empty")}</Text>
            </View>
          ) : (
            draft.scripts.map((script, index) => (
              <ScriptRow
                key={script.id}
                script={script}
                isFirst={index === 0}
                onEdit={handleEditScript}
                onRemove={handleRemoveScript}
              />
            ))
          )}
        </View>
      </SettingsGroup>

      <SettingsGroup
        title={t("settings.project.metadata.title")}
        info={t("settings.project.metadata.info")}
        testID="metadata-group"
      >
        {METADATA_PROMPT_KEYS.map((key, index) => (
          <MetadataPromptSection
            key={key}
            promptKey={key}
            value={draft.metadataPrompts[key]}
            onChange={handleMetadataPromptChange}
            flush={index === METADATA_PROMPT_KEYS.length - 1}
          />
        ))}
      </SettingsGroup>

      {isStale ? (
        <View style={styles.calloutWrap}>
          <Alert
            testID="stale-callout"
            variant="error"
            title={t("settings.project.writeFailures.staleTitle")}
            description={t("settings.project.writeFailures.staleDescription")}
          >
            <Button
              testID="stale-callout-action-0"
              onPress={handleReload}
              variant="outline"
              size="sm"
            >
              {t("settings.project.actions.reload")}
            </Button>
          </Alert>
        </View>
      ) : null}

      {isWriteFailed ? (
        <View style={styles.calloutWrap}>
          <Alert
            testID="write-failed-callout"
            variant="error"
            title={t("settings.project.writeFailures.failedTitle")}
            description={t("settings.project.writeFailures.failedDescription")}
          >
            <Button
              testID="write-failed-callout-action-0"
              onPress={handleSave}
              variant="outline"
              size="sm"
            >
              {t("settings.project.actions.tryAgain")}
            </Button>
            <Button
              testID="write-failed-callout-action-1"
              onPress={handleReload}
              variant="outline"
              size="sm"
            >
              {t("settings.project.actions.reload")}
            </Button>
          </Alert>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button
          testID="save-button"
          accessibilityLabel={t("settings.project.actions.save")}
          variant="default"
          size="md"
          disabled={saveDisabled}
          loading={saveMutation.isPending}
          onPress={handleSave}
        >
          {saveMutation.isPending
            ? t("settings.project.actions.saving")
            : t("settings.project.actions.save")}
        </Button>
      </View>

      {editingScript ? (
        <ScriptEditModal
          script={editingScript}
          onChange={handleEditingDraftChange}
          onCancel={handleCancelEditing}
          onSave={handleSaveEditing}
        />
      ) : null}
    </View>
  );
}

interface ProjectConfigurationValidation {
  hasErrors: boolean;
  projectDirectoryError: string | null;
  indexIntervalError: string | null;
  variableError: string | null;
}

function validateProjectConfiguration(
  draft: ProjectConfigDraft,
  t: TFunction,
): ProjectConfigurationValidation {
  const enabledProjectDirectories = draft.projectDirectories.project.filter(
    (entry) => entry.enabled && entry.path.trim().length > 0,
  );
  const projectDirectoryError =
    draft.projectDirectoryMode === "single" && enabledProjectDirectories.length !== 1
      ? t("settings.project.resources.project.validation.singleRequired")
      : null;
  const interval = draft.projectIndexUpdateIntervalText.trim();
  const parsedInterval = Number(interval);
  const indexIntervalError =
    interval.length > 0 && (!Number.isSafeInteger(parsedInterval) || parsedInterval <= 0)
      ? t("settings.project.indexSkill.validation.interval")
      : null;

  const variableNames = draft.projectVariables.map((entry) => entry.name.trim()).filter(Boolean);
  const invalidVariable = variableNames.find((name) => !/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name));
  const duplicateVariable = variableNames.find(
    (name, index) => variableNames.indexOf(name) !== index,
  );
  let variableError: string | null = null;
  if (invalidVariable) {
    variableError = t("settings.project.variables.validation.invalidName", {
      name: invalidVariable,
    });
  } else if (duplicateVariable) {
    variableError = t("settings.project.variables.validation.duplicateName", {
      name: duplicateVariable,
    });
  }

  return {
    hasErrors: Boolean(projectDirectoryError || indexIntervalError || variableError),
    projectDirectoryError,
    indexIntervalError,
    variableError,
  };
}

interface ProjectResourcesEditorProps {
  draft: ProjectConfigDraft;
  projectDirectoryPath: string;
  globalIndexInterval: number;
  globalIndexIntervalText: string;
  validation: ProjectConfigurationValidation;
  onDirectoryModeChange: (value: "single" | "multiple") => void;
  onDirectoryChange: (key: ProjectDirectoryKey, values: ProjectDirectoryDraft[]) => void;
  onIndexAutoGenerateChange: (value: boolean) => void;
  onProjectIndexIntervalChange: (value: string) => void;
  onGlobalIndexIntervalChange: (value: string) => void;
  onSaveGlobalIndexInterval: () => void;
  onVariablesChange: (values: ProjectVariableDraft[]) => void;
}

function ProjectResourcesEditor({
  draft,
  projectDirectoryPath,
  globalIndexInterval,
  globalIndexIntervalText,
  validation,
  onDirectoryModeChange,
  onDirectoryChange,
  onIndexAutoGenerateChange,
  onProjectIndexIntervalChange,
  onGlobalIndexIntervalChange,
  onSaveGlobalIndexInterval,
  onVariablesChange,
}: ProjectResourcesEditorProps) {
  const { t } = useTranslation();
  return (
    <>
      <SettingsGroup
        title={t("settings.project.resources.title")}
        info={t("settings.project.resources.info")}
        testID="project-resources-group"
      >
        <DirectoryListSection
          title={t("settings.project.resources.project.title")}
          hint={t("settings.project.resources.project.hint")}
          directoryKey="project"
          values={draft.projectDirectories.project}
          mode={draft.projectDirectoryMode}
          projectDirectoryPath={projectDirectoryPath}
          error={validation.projectDirectoryError}
          onModeChange={onDirectoryModeChange}
          onChange={onDirectoryChange}
        />
        <DirectoryListSection
          title={t("settings.project.resources.knowledge.title")}
          hint={t("settings.project.resources.knowledge.hint")}
          directoryKey="knowledge"
          values={draft.projectDirectories.knowledge}
          onChange={onDirectoryChange}
        />
        <DirectoryListSection
          title={t("settings.project.resources.indexSkill.title")}
          hint={t("settings.project.resources.indexSkill.hint")}
          directoryKey="indexSkill"
          values={draft.projectDirectories.indexSkill}
          onChange={onDirectoryChange}
        />
        <DirectoryListSection
          title={t("settings.project.resources.workspaceData.title")}
          hint={t("settings.project.resources.workspaceData.hint")}
          directoryKey="workspaceData"
          values={draft.projectDirectories.workspaceData}
          onChange={onDirectoryChange}
          flush
        />
      </SettingsGroup>

      <SettingsGroup
        title={t("settings.project.indexSkill.title")}
        info={t("settings.project.indexSkill.info")}
        testID="project-index-group"
      >
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>
                {t("settings.project.indexSkill.autoGenerate")}
              </Text>
              <Text style={settingsStyles.rowHint}>
                {t("settings.project.indexSkill.autoGenerateHint")}
              </Text>
            </View>
            <Switch
              value={draft.projectIndexAutoGenerate}
              onValueChange={onIndexAutoGenerateChange}
              testID="project-index-auto-generate"
            />
          </View>
          <View style={styles.inlineFormRow}>
            <View style={styles.inlineFormText}>
              <Text style={settingsStyles.rowTitle}>
                {t("settings.project.indexSkill.projectInterval")}
              </Text>
              <Text style={settingsStyles.rowHint}>
                {t("settings.project.indexSkill.projectIntervalHint", {
                  minutes: globalIndexInterval,
                })}
              </Text>
            </View>
            <TextInput
              value={draft.projectIndexUpdateIntervalText}
              onChangeText={onProjectIndexIntervalChange}
              keyboardType="number-pad"
              placeholder={String(globalIndexInterval)}
              placeholderTextColor={styles.placeholderColor.color}
              style={styles.compactInput}
              testID="project-index-project-interval"
            />
          </View>
          {validation.indexIntervalError ? (
            <Text style={styles.fieldError}>{validation.indexIntervalError}</Text>
          ) : null}
          <View style={styles.inlineFormRow}>
            <View style={styles.inlineFormText}>
              <Text style={settingsStyles.rowTitle}>
                {t("settings.project.indexSkill.globalInterval")}
              </Text>
              <Text style={settingsStyles.rowHint}>
                {t("settings.project.indexSkill.globalIntervalHint")}
              </Text>
            </View>
            <TextInput
              value={globalIndexIntervalText}
              onChangeText={onGlobalIndexIntervalChange}
              keyboardType="number-pad"
              placeholder="1440"
              placeholderTextColor={styles.placeholderColor.color}
              style={styles.compactInput}
              testID="project-index-global-interval"
            />
            <Button variant="outline" size="sm" onPress={onSaveGlobalIndexInterval}>
              {t("settings.project.indexSkill.apply")}
            </Button>
          </View>
        </View>
      </SettingsGroup>

      <ProjectVariablesEditor
        values={draft.projectVariables}
        error={validation.variableError}
        onChange={onVariablesChange}
      />
    </>
  );
}

/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Dynamic form rows bind edits to their current row values. */
function DirectoryListSection({
  title,
  hint,
  directoryKey,
  values,
  mode,
  projectDirectoryPath,
  error,
  onModeChange,
  onChange,
  flush,
}: {
  title: string;
  hint: string;
  directoryKey: ProjectDirectoryKey;
  values: ProjectDirectoryDraft[];
  mode?: "single" | "multiple";
  projectDirectoryPath?: string;
  error?: string | null;
  onModeChange?: (value: "single" | "multiple") => void;
  onChange: (key: ProjectDirectoryKey, values: ProjectDirectoryDraft[]) => void;
  flush?: boolean;
}) {
  const { t } = useTranslation();
  const add = useCallback(
    () =>
      onChange(directoryKey, [
        ...values,
        {
          id: `project-directory-${directoryKey}-${Date.now()}`,
          path: "",
          enabled: true,
        },
      ]),
    [directoryKey, onChange, values],
  );
  const canAdd = mode !== "single" || values.length === 0;
  return (
    <SettingsSection
      title={title}
      flush={flush}
      trailing={
        <Pressable
          onPress={add}
          disabled={!canAdd}
          hitSlop={8}
          style={[settingsStyles.sectionHeaderLink, !canAdd && styles.disabledControl]}
        >
          <Plus size={ICON_SIZE} color={styles.iconColor.color} />
        </Pressable>
      }
    >
      <Text style={styles.sectionHint}>{hint}</Text>
      {mode && onModeChange ? (
        <View style={styles.directoryModeRow}>
          <Button
            variant={mode === "single" ? "default" : "outline"}
            size="sm"
            onPress={() => onModeChange("single")}
            testID="project-directory-mode-single"
          >
            {t("settings.project.resources.project.single")}
          </Button>
          <Button
            variant={mode === "multiple" ? "default" : "outline"}
            size="sm"
            onPress={() => onModeChange("multiple")}
            testID="project-directory-mode-multiple"
          >
            {t("settings.project.resources.project.multiple")}
          </Button>
        </View>
      ) : null}
      <View style={styles.listEditor}>
        {values.length === 0 ? (
          <Text style={styles.emptyScripts}>
            {t("settings.project.resources.emptyDirectories")}
          </Text>
        ) : (
          values.map((value) => (
            <View key={value.id} style={styles.listEditorRow}>
              <Switch
                value={value.enabled}
                onValueChange={(enabled) =>
                  onChange(
                    directoryKey,
                    values.map((entry) => (entry.id === value.id ? { ...entry, enabled } : entry)),
                  )
                }
                testID={`project-directory-enabled-${value.id}`}
              />
              <TextInput
                value={
                  projectDirectoryPath
                    ? projectDirectoryPathForDisplay(value.path, projectDirectoryPath)
                    : value.path
                }
                onChangeText={(next) =>
                  onChange(
                    directoryKey,
                    values.map((entry) =>
                      entry.id === value.id ? { ...entry, path: next } : entry,
                    ),
                  )
                }
                placeholder="./path"
                placeholderTextColor={styles.placeholderColor.color}
                style={styles.flexInput}
              />
              <Pressable
                accessibilityLabel={t("settings.project.resources.removeDirectory", { title })}
                onPress={() =>
                  onChange(
                    directoryKey,
                    values.filter((entry) => entry.id !== value.id),
                  )
                }
                style={styles.removeIconButton}
              >
                <X size={ICON_SIZE} color={styles.iconColor.color} />
              </Pressable>
            </View>
          ))
        )}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    </SettingsSection>
  );
}

function ProjectVariablesEditor({
  values,
  error,
  onChange,
}: {
  values: ProjectVariableDraft[];
  error: string | null;
  onChange: (values: ProjectVariableDraft[]) => void;
}) {
  const { t } = useTranslation();
  const add = useCallback(
    () => onChange([...values, { id: `variable-${Date.now()}`, name: "", value: "" }]),
    [onChange, values],
  );
  return (
    <SettingsGroup
      title={t("settings.project.variables.title")}
      info={t("settings.project.variables.info")}
      trailing={
        <Pressable onPress={add} hitSlop={8} style={settingsStyles.sectionHeaderLink}>
          <Plus size={ICON_SIZE} color={styles.iconColor.color} />
        </Pressable>
      }
      testID="project-variables-group"
    >
      <View style={settingsStyles.card}>
        {values.length === 0 ? (
          <View style={settingsStyles.row}>
            <Text style={styles.emptyScripts}>{t("settings.project.variables.empty")}</Text>
          </View>
        ) : (
          values.map((entry) => (
            <View key={entry.id} style={styles.variableRow}>
              <TextInput
                value={entry.name}
                onChangeText={(name) =>
                  onChange(
                    values.map((value) => (value.id === entry.id ? { ...value, name } : value)),
                  )
                }
                placeholder={t("settings.project.variables.namePlaceholder")}
                placeholderTextColor={styles.placeholderColor.color}
                style={styles.flexInput}
              />
              <TextInput
                value={entry.value}
                onChangeText={(value) =>
                  onChange(values.map((item) => (item.id === entry.id ? { ...item, value } : item)))
                }
                placeholder={t("settings.project.variables.valuePlaceholder")}
                placeholderTextColor={styles.placeholderColor.color}
                style={styles.flexInput}
              />
              <Pressable
                accessibilityLabel={t("settings.project.variables.remove")}
                onPress={() => onChange(values.filter((value) => value.id !== entry.id))}
                style={styles.removeIconButton}
              >
                <X size={ICON_SIZE} color={styles.iconColor.color} />
              </Pressable>
            </View>
          ))
        )}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    </SettingsGroup>
  );
}

/* oxlint-enable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop */

function ResolveSpinnerColor(): string {
  return styles.spinnerColor.color;
}

function ProjectTitleIcon({
  iconDataUri,
  projectName,
  projectViewKey,
}: {
  iconDataUri: string | null;
  projectName: string;
  projectViewKey: string;
}) {
  const initial = projectName.trim().charAt(0).toUpperCase() || "?";
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={initial}
      projectViewKey={projectViewKey}
      size={28}
      textStyle={styles.titleIconFallbackText}
    />
  );
}

interface MetadataPromptSectionProps {
  promptKey: MetadataPromptKey;
  value: string;
  onChange: (key: MetadataPromptKey, text: string) => void;
  flush?: boolean;
}

function MetadataPromptSection({ promptKey, value, onChange, flush }: MetadataPromptSectionProps) {
  const { t } = useTranslation();
  const meta = METADATA_PROMPT_FIELDS[promptKey];
  const title = t(meta.titleKey);
  const handleChange = useCallback(
    (text: string) => onChange(promptKey, text),
    [onChange, promptKey],
  );
  return (
    <SettingsSection title={title} testID={meta.sectionTestID} flush={flush}>
      <SettingsTextAreaCard
        testID={meta.inputTestID}
        accessibilityLabel={title}
        value={value}
        onChangeText={handleChange}
        placeholder={t(meta.placeholderKey)}
      />
    </SettingsSection>
  );
}

interface ScriptRowProps {
  script: ProjectScriptDraft;
  isFirst: boolean;
  onEdit: (script: ProjectScriptDraft) => void;
  onRemove: (script: ProjectScriptDraft) => void;
}

function ScriptRow({ script, isFirst, onEdit, onRemove }: ScriptRowProps) {
  const { t } = useTranslation();
  const handleEdit = useCallback(() => onEdit(script), [onEdit, script]);
  const handleRemove = useCallback(() => onRemove(script), [onRemove, script]);
  const rowStyle = isFirst ? styles.scriptRow : styles.scriptRowWithBorder;

  return (
    <View style={rowStyle} testID={`script-row-${script.id}`}>
      <Pressable style={styles.scriptRowMain} onPress={handleEdit}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {script.name || t("settings.project.scripts.untitled")}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={1}>
          {scriptHint(script, t)}
        </Text>
      </Pressable>
      <DropdownMenu>
        <DropdownMenuTrigger
          accessibilityLabel={t("settings.project.scripts.menuAccessibility")}
          testID={`script-row-menu-${script.id}`}
          style={styles.scriptKebab}
        >
          <MoreVertical size={ICON_SIZE} color={styles.chevronColor.color} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" minWidth={160}>
          <DropdownMenuItem testID={`script-action-${script.id}-edit`} onSelect={handleEdit}>
            {t("settings.project.scripts.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            testID={`script-action-${script.id}-remove`}
            destructive
            onSelect={handleRemove}
          >
            {t("settings.project.scripts.actions.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function scriptHint(script: ProjectScriptDraft, t: TFunction): string {
  const pieces: string[] = [];
  if (script.type) pieces.push(script.type);
  if (script.portText) pieces.push(t("settings.project.scripts.port", { port: script.portText }));
  if (script.commandText) pieces.push(script.commandText.split("\n")[0] ?? "");
  return pieces.join(" · ");
}

interface ScriptValidation {
  hasErrors: boolean;
  nameError: string | null;
  commandError: string | null;
}

function validateScript(script: ProjectScriptDraft, t: TFunction): ScriptValidation {
  const nameError =
    script.name.trim().length === 0 ? t("settings.project.scripts.nameRequired") : null;
  const commandError =
    script.commandText.trim().length === 0 ? t("settings.project.scripts.commandRequired") : null;
  return {
    hasErrors: Boolean(nameError || commandError),
    nameError,
    commandError,
  };
}

interface ScriptEditModalProps {
  script: ProjectScriptDraft;
  onChange: (next: ProjectScriptDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

interface ScriptFieldsTouched {
  name: boolean;
  command: boolean;
}

const ALL_TOUCHED: ScriptFieldsTouched = { name: true, command: true };
const NONE_TOUCHED: ScriptFieldsTouched = { name: false, command: false };

function ScriptEditModal({ script, onChange, onCancel, onSave }: ScriptEditModalProps) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState<ScriptFieldsTouched>(NONE_TOUCHED);

  useEffect(() => {
    setTouched(NONE_TOUCHED);
  }, [script.id]);

  const markTouched = useCallback((field: keyof ScriptFieldsTouched) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const handleNameChange = useCallback(
    (text: string) => onChange({ ...script, name: text }),
    [onChange, script],
  );
  const handleCommandChange = useCallback(
    (text: string) => onChange({ ...script, commandText: text }),
    [onChange, script],
  );
  const handleServiceToggle = useCallback(
    (next: boolean) => onChange({ ...script, type: next ? SCRIPT_SERVICE_TYPE : "" }),
    [onChange, script],
  );

  const handleNameBlur = useCallback(() => markTouched("name"), [markTouched]);
  const handleCommandBlur = useCallback(() => markTouched("command"), [markTouched]);

  const validation = validateScript(script, t);

  const handleSavePress = useCallback(() => {
    if (validation.hasErrors) {
      setTouched(ALL_TOUCHED);
      return;
    }
    onSave();
  }, [validation.hasErrors, onSave]);

  const showNameError = touched.name && validation.nameError;
  const showCommandError = touched.command && validation.commandError;
  const isService = script.type === SCRIPT_SERVICE_TYPE;
  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: script.name
        ? t("settings.project.scripts.editScript", { name: script.name })
        : t("settings.project.scripts.newScript"),
    }),
    [script.name, t],
  );

  return (
    <AdaptiveModalSheet
      visible
      header={sheetHeader}
      onClose={onCancel}
      testID="script-edit-modal"
      desktopMaxWidth={560}
    >
      <View style={styles.modalSection}>
        <Text style={styles.modalLabel}>{t("settings.project.scripts.name")}</Text>
        <TextInput
          testID="script-edit-name"
          accessibilityLabel={t("settings.project.scripts.nameAccessibility")}
          value={script.name}
          onChangeText={handleNameChange}
          onBlur={handleNameBlur}
          placeholder="dev"
          placeholderTextColor={styles.placeholderColor.color}
          style={styles.modalInput}
        />
        {showNameError ? (
          <Text testID="script-edit-name-error" style={styles.fieldError}>
            {validation.nameError}
          </Text>
        ) : null}
      </View>
      <View style={styles.modalSection}>
        <Text style={styles.modalLabel}>{t("settings.project.scripts.command")}</Text>
        <TextInput
          testID="script-edit-command"
          accessibilityLabel={t("settings.project.scripts.commandAccessibility")}
          multiline
          value={script.commandText}
          onChangeText={handleCommandChange}
          onBlur={handleCommandBlur}
          placeholder="npm run dev"
          placeholderTextColor={styles.placeholderColor.color}
          style={styles.modalMultilineInput}
        />
        {showCommandError ? (
          <Text testID="script-edit-command-error" style={styles.fieldError}>
            {validation.commandError}
          </Text>
        ) : null}
      </View>
      <View style={styles.modalSection}>
        <View style={styles.serviceToggleRow}>
          <View style={styles.serviceToggleText}>
            <Text style={styles.serviceToggleLabel}>
              {t("settings.project.scripts.runAsService")}
            </Text>
            <Text style={styles.modalHint}>{t("settings.project.scripts.serviceHint")}</Text>
          </View>
          <Switch
            value={isService}
            onValueChange={handleServiceToggle}
            accessibilityLabel={t("settings.project.scripts.runAsService")}
            testID="script-edit-service-toggle"
          />
        </View>
      </View>
      <View style={styles.modalFooter}>
        <Button onPress={onCancel} variant="ghost" size="md" testID="script-edit-cancel">
          {t("settings.project.actions.cancel")}
        </Button>
        <Button onPress={handleSavePress} variant="default" size="md" testID="script-edit-save">
          {t("settings.project.actions.save")}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  noTargetContainer: {
    padding: theme.spacing[4],
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  noTargetText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  body: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 0,
  },
  headerBlock: {
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 1,
  },
  projectId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: Platform.select({ web: "monospace", default: undefined }),
  },
  nameEditorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  nameEditorIconButton: {
    padding: theme.spacing[1],
  },
  titleIconFallbackText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  errorBlock: {
    marginTop: theme.spacing[2],
  },
  emptyScripts: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  sectionHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginBottom: theme.spacing[2],
  },
  directoryModeRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  disabledControl: {
    opacity: 0.35,
  },
  listEditor: {
    gap: theme.spacing[2],
  },
  listEditorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  variableRow: {
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: {
      xs: "stretch",
      md: "center",
    },
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  flexInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  compactInput: {
    width: 120,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  removeIconButton: {
    padding: theme.spacing[2],
    alignSelf: "center",
  },
  inlineFormRow: {
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: {
      xs: "stretch",
      md: "center",
    },
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  inlineFormText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  scriptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  scriptRowWithBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  scriptRowMain: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  scriptKebab: {
    padding: theme.spacing[1],
  },
  calloutWrap: {
    marginTop: theme.spacing[3],
  },
  footer: {
    marginTop: theme.spacing[4],
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalSection: {
    gap: theme.spacing[2],
  },
  modalLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  modalInput: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  modalMultilineInput: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  fieldError: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
  },
  serviceToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  serviceToggleText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  serviceToggleLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  modalHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
  chevronColor: {
    color: theme.colors.foregroundMuted,
  },
  spinnerColor: {
    color: theme.colors.foregroundMuted,
  },
}));
