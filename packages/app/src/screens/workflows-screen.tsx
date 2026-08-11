/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-jsx-as-prop, react/jsx-max-depth -- The recursive workflow form binds controls to the current draft and intentionally composes nested editor sections. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  FileCode2,
  CircleHelp,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  WorkflowPayloadSchema,
  type WorkflowNodeRun,
  type WorkflowRun,
  type WorkflowScript,
  type WorkflowScriptFile,
  type WorkflowScriptSummary,
} from "@getpaseo/protocol/workflow/types";
import { MenuHeader } from "@/components/headers/menu-header";
import { WorkflowAgentOutput } from "@/components/workflows/workflow-agent-output";
import { WorkflowStepListEditor } from "@/components/workflows/workflow-step-editor";
import { WorkflowUsageGuide } from "@/components/workflows/workflow-usage-guide";
import { WorkflowTextInput } from "@/components/workflows/workflow-text-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form-field";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/contexts/toast-context";
import { useAssistants } from "@/hooks/use-assistants";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useTeams } from "@/hooks/use-teams";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import { confirmDialog } from "@/utils/confirm-dialog";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { storeFetchedAgentDetail } from "@/utils/store-fetched-agent-detail";
import {
  countWorkflowSteps,
  createEmptyWorkflowScript,
  validateWorkflowDraft,
} from "@/workflows/editor-model";
import {
  deriveWorkflowNodeActions,
  deriveWorkflowNodeIdentity,
} from "@/workflows/run-node-actions";
import { parseWorkflowProcessOutput } from "@/workflows/run-output";

type LoadState = "idle" | "loading" | "loaded" | "error";

const DEFAULT_WORKFLOW_INPUT_JSON = `{
  "control": ""
}`;

function parseWorkflowInputJson(input: string): {
  inputPayload: string;
  formattedInput: string | null;
} {
  const rawPayload: unknown = JSON.parse(input);
  const isPayloadObject =
    typeof rawPayload === "object" && rawPayload !== null && !Array.isArray(rawPayload);
  const rawRecord = isPayloadObject ? (rawPayload as Record<string, unknown>) : null;
  const missingControl = rawRecord && !Object.hasOwn(rawRecord, "control");
  const hasFrameworkError = rawRecord && Object.hasOwn(rawRecord, "error");
  const { error: _frameworkError, ...nodeInput } = rawRecord ?? {};
  const normalizedPayload = rawRecord
    ? {
        ...nodeInput,
        control: Object.hasOwn(nodeInput, "control") ? nodeInput.control : "",
        error: "",
      }
    : rawPayload;
  const parsed = WorkflowPayloadSchema.parse(normalizedPayload);
  const { error: _internalError, ...parsedNodeInput } = parsed;
  return {
    inputPayload: JSON.stringify(parsedNodeInput),
    formattedInput:
      missingControl || hasFrameworkError ? JSON.stringify(parsedNodeInput, null, 2) : null,
  };
}

export function WorkflowsScreen(): ReactElement {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <WorkflowsScreenContent />;
}

// oxlint-disable-next-line complexity -- This screen coordinates the workflow editor lifecycle, RPC state, execution, and cancellation in one state owner.
function WorkflowsScreenContent(): ReactElement {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const hosts = useHosts();
  const [selectedHost, setSelectedHost] = useState("");
  const client = useHostRuntimeClient(selectedHost);
  const providersSnapshot = useProvidersSnapshot(selectedHost || null, {
    enabled: Boolean(selectedHost),
  });
  const daemonConfig = useDaemonConfig(selectedHost || null);
  const assistantsResult = useAssistants(selectedHost, {
    enabled: Boolean(selectedHost),
  });
  const supportsTeams = useHostFeature(selectedHost, "teams");
  const teamsResult = useTeams(selectedHost, {
    enabled: Boolean(selectedHost) && supportsTeams,
  });
  const [scripts, setScripts] = useState<WorkflowScriptSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkflowScript | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [inputJson, setInputJson] = useState(DEFAULT_WORKFLOW_INPUT_JSON);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [usageGuideVisible, setUsageGuideVisible] = useState(false);
  const requestGeneration = useRef(0);
  const wide = width >= 960;

  useEffect(() => {
    if (hosts.length === 0) {
      setSelectedHost("");
      return;
    }
    if (!hosts.some((host) => host.serverId === selectedHost)) {
      setSelectedHost(hosts[0]?.serverId ?? "");
    }
  }, [hosts, selectedHost]);

  const loadScripts = useCallback(async () => {
    if (!client) {
      setScripts([]);
      setLoadState(selectedHost ? "error" : "idle");
      setLoadError(selectedHost ? t("workflows.host.offline") : null);
      return;
    }
    const generation = ++requestGeneration.current;
    setLoadState("loading");
    setLoadError(null);
    try {
      const payload = await client.workflowList();
      if (generation !== requestGeneration.current) {
        return;
      }
      if (payload.error) {
        throw new Error(payload.error);
      }
      setScripts(payload.scripts);
      setLoadState("loaded");
    } catch (error) {
      if (generation !== requestGeneration.current) {
        return;
      }
      setLoadState("error");
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [client, selectedHost, t]);

  useEffect(() => {
    setDraft(null);
    setDraftPath(null);
    setSelectedPath(null);
    setDirty(false);
    setActiveRun(null);
    void loadScripts();
  }, [loadScripts, selectedHost]);

  const selectWorkflow = useCallback(
    async (path: string) => {
      if (!client) {
        return;
      }
      if (dirty) {
        const confirmed = await confirmDialog({
          title: t("workflows.dialogs.discardTitle"),
          message: t("workflows.dialogs.discardMessage"),
          confirmLabel: t("workflows.actions.discard"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
      }
      setSelectedPath(path);
      setActiveRun(null);
      try {
        const payload = await client.workflowInspect({ scriptPath: path });
        if (payload.error || !payload.script) {
          throw new Error(payload.error ?? t("workflows.messages.notFound"));
        }
        setDraft(payload.script.script);
        setDraftPath(payload.script.path);
        setDirty(false);
        setActiveRun(payload.latestRun);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [client, dirty, t, toast],
  );

  const createWorkflow = useCallback(async () => {
    if (dirty) {
      const confirmed = await confirmDialog({
        title: t("workflows.dialogs.discardTitle"),
        message: t("workflows.dialogs.discardMessage"),
        confirmLabel: t("workflows.actions.discard"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    setDraft(
      createEmptyWorkflowScript({
        workflow: t("workflows.editor.untitled"),
        bash: t("workflows.nodes.defaultNames.bash"),
        agent: t("workflows.nodes.defaultNames.agent"),
        workflowNode: t("workflows.nodes.defaultNames.workflow"),
        switch: t("workflows.nodes.defaultNames.switch"),
        for: t("workflows.nodes.defaultNames.for"),
      }),
    );
    setDraftPath(null);
    setSelectedPath(null);
    setDirty(true);
    setActiveRun(null);
  }, [dirty, t]);

  const updateDraft = useCallback((next: WorkflowScript) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const persistDraft = useCallback(async (): Promise<WorkflowScriptFile | null> => {
    if (!client || !draft) {
      return null;
    }
    const validationError = validateWorkflowDraft(draft, draftPath);
    if (validationError) {
      toast.error(validationError);
      return null;
    }
    setSaving(true);
    try {
      const payload = await client.workflowSave({
        ...(draftPath ? { scriptPath: draftPath } : {}),
        script: draft,
      });
      if (payload.error || !payload.script) {
        throw new Error(payload.error ?? t("workflows.messages.saveFailed"));
      }
      setDraft(payload.script.script);
      setDraftPath(payload.script.path);
      setSelectedPath(payload.script.path);
      setDirty(false);
      await loadScripts();
      toast.show(t("workflows.messages.saved"), { variant: "success" });
      return payload.script;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setSaving(false);
    }
  }, [client, draft, draftPath, loadScripts, t, toast]);

  const deleteWorkflow = useCallback(async () => {
    if (!client || !draftPath || !draft) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("workflows.dialogs.deleteTitle"),
      message: t("workflows.dialogs.deleteMessage", { name: draft.name }),
      confirmLabel: t("workflows.actions.delete"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      const payload = await client.workflowDelete({ scriptPath: draftPath });
      if (payload.error) {
        throw new Error(payload.error);
      }
      setDraft(null);
      setDraftPath(null);
      setSelectedPath(null);
      setDirty(false);
      setActiveRun(null);
      await loadScripts();
      toast.show(t("workflows.messages.deleted"), { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [client, draft, draftPath, loadScripts, t, toast]);

  const runWorkflow = useCallback(async () => {
    if (!client || !draft) {
      return;
    }
    const normalizedInput = inputJson.trim();
    if (!normalizedInput) {
      toast.error(t("workflows.messages.inputRequired"));
      return;
    }
    let inputPayload: string;
    try {
      const parsedInput = parseWorkflowInputJson(normalizedInput);
      inputPayload = parsedInput.inputPayload;
      if (parsedInput.formattedInput) {
        setInputJson(parsedInput.formattedInput);
      }
    } catch {
      toast.error(t("workflows.messages.invalidInputJson"));
      return;
    }
    const saved = dirty || !draftPath ? await persistDraft() : { path: draftPath, script: draft };
    if (!saved) {
      return;
    }
    setRunning(true);
    try {
      const payload = await client.workflowRun({
        scriptPath: saved.path,
        inputPayload,
      });
      if (payload.error || !payload.run) {
        throw new Error(payload.error ?? t("workflows.messages.startFailed"));
      }
      setActiveRun(payload.run);
      toast.show(t("workflows.messages.started"), { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [client, dirty, draft, draftPath, inputJson, persistDraft, t, toast]);

  const cancelWorkflow = useCallback(async () => {
    if (!client || activeRun?.status !== "running") {
      return;
    }
    setCancelling(true);
    try {
      const payload = await client.workflowCancelRun({ runId: activeRun.id });
      if (payload.error || !payload.run) {
        throw new Error(payload.error ?? t("workflows.messages.cancelFailed"));
      }
      setActiveRun(payload.run);
      toast.show(t("workflows.messages.cancelled"), { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCancelling(false);
    }
  }, [activeRun, client, t, toast]);

  const openWorkflowAgent = useCallback(
    async (agentId: string) => {
      if (!client || !selectedHost) {
        return;
      }
      try {
        const result = await client.fetchAgent({ agentId });
        if (!result) {
          throw new Error(t("workflows.messages.agentNotFound"));
        }
        const agent = storeFetchedAgentDetail({ serverId: selectedHost, result });
        navigateToAgent({
          serverId: selectedHost,
          agentId,
          workspaceId: agent.workspaceId,
          pin: true,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [client, selectedHost, t, toast],
  );

  useEffect(() => {
    if (!client || activeRun?.status !== "running") {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const payload = await client.workflowGetRun({ runId: activeRun.id });
        if (cancelled || payload.error || !payload.run) {
          return;
        }
        setActiveRun(payload.run);
      } catch {
        return;
      }
    };
    const timer = setInterval(() => void poll(), 1_000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeRun?.id, activeRun?.status, client]);

  const hostOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      hosts.map((host) => ({
        id: host.serverId,
        value: host.serverId,
        label: host.label,
      })),
    [hosts],
  );
  const selectedHostOption = hostOptions.find((option) => option.value === selectedHost);
  const validationError = draft ? validateWorkflowDraft(draft, draftPath) : null;

  return (
    <View style={styles.container}>
      <MenuHeader
        title={t("workflows.title")}
        rightContent={
          <View style={styles.headerActions}>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={CircleHelp}
              onPress={() => setUsageGuideVisible(true)}
              testID="workflows-usage-guide"
            >
              {t("workflows.actions.guide")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={RefreshCw}
              onPress={() => void loadScripts()}
              disabled={!client}
              testID="workflows-refresh"
            >
              {t("workflows.actions.refresh")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={Plus}
              onPress={() => void createWorkflow()}
              disabled={!client}
              testID="workflows-new"
            >
              {t("workflows.actions.new")}
            </Button>
          </View>
        }
      />
      <WorkflowUsageGuide
        visible={usageGuideVisible}
        scriptPath={draftPath}
        onClose={() => setUsageGuideVisible(false)}
      />
      <View style={styles.hostBar}>
        {hosts.length > 1 ? (
          <View style={styles.hostSelector}>
            <SelectField
              field={false}
              label=""
              value={selectedHost}
              selectedDisplay={selectedHostOption ? { label: selectedHostOption.label } : null}
              options={hostOptions}
              onChange={(serverId) => setSelectedHost(serverId)}
              placeholder={t("workflows.host.select")}
              emptyText={t("workflows.host.empty")}
              title={t("workflows.host.title")}
              size="sm"
            />
          </View>
        ) : (
          <Text style={styles.hostLabel}>
            {selectedHostOption?.label ??
              (hosts.length === 0 ? t("workflows.host.notConfigured") : "")}
          </Text>
        )}
        <Text style={styles.hostHint}>{t("workflows.host.hint")}</Text>
      </View>
      <View style={[styles.workspace, !wide && styles.workspaceCompact]}>
        <WorkflowListPane
          scripts={scripts}
          state={loadState}
          error={loadError}
          selectedPath={selectedPath}
          onSelect={(path) => void selectWorkflow(path)}
          onCreate={() => void createWorkflow()}
          onRetry={() => void loadScripts()}
          wide={wide}
        />
        <View style={styles.editorPane}>
          {draft ? (
            <ScrollView
              style={styles.editorScroll}
              contentContainerStyle={styles.editorContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.editorToolbar}>
                <View style={styles.editorTitleGroup}>
                  <View style={styles.editorTitleRow}>
                    <WorkflowTextInput
                      value={draft.name}
                      onChangeText={(name) => updateDraft({ ...draft, name })}
                      placeholder={t("workflows.editor.untitled")}
                      accessibilityLabel={t("workflows.editor.name")}
                      style={styles.editorTitleInput}
                      testID="workflow-name"
                    />
                    {dirty ? (
                      <StatusBadge label={t("workflows.editor.unsaved")} variant="muted" />
                    ) : null}
                  </View>
                  <Text style={styles.editorPath} numberOfLines={1}>
                    {draftPath ?? t("workflows.editor.generatedFileName")}
                  </Text>
                </View>
                <View style={styles.editorActions}>
                  {draftPath ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Trash2}
                      onPress={() => void deleteWorkflow()}
                    >
                      {t("workflows.actions.delete")}
                    </Button>
                  ) : null}
                  <Button
                    variant="default"
                    size="sm"
                    leftIcon={Save}
                    onPress={() => void persistDraft()}
                    loading={saving}
                    disabled={!dirty && Boolean(draftPath)}
                    testID="workflow-save"
                  >
                    {t("workflows.actions.save")}
                  </Button>
                </View>
              </View>

              {validationError ? (
                <View style={styles.validationBanner}>
                  <XCircle size={16} color={styles.validationIcon.color} />
                  <Text style={styles.validationText}>{validationError}</Text>
                </View>
              ) : null}

              <View style={styles.metadataCard}>
                <View style={styles.metadataCountRow}>
                  <View style={styles.metadataCount}>
                    <Text style={styles.metadataCountValue}>{countWorkflowSteps(draft.steps)}</Text>
                    <Text style={styles.metadataCountLabel}>{t("workflows.editor.nodes")}</Text>
                  </View>
                </View>
                <Field label={t("workflows.editor.description")}>
                  <WorkflowTextInput
                    value={draft.description ?? ""}
                    onChangeText={(description) => updateDraft({ ...draft, description })}
                    multiline
                    textAlignVertical="top"
                    style={styles.descriptionInput}
                    placeholder={t("workflows.editor.descriptionPlaceholder")}
                  />
                </Field>
                <View style={styles.policyGrid}>
                  <View style={styles.policyField}>
                    <Field
                      label={t("workflows.editor.workflowTimeout")}
                      hint={t("workflows.editor.workflowTimeoutHint")}
                    >
                      <WorkflowTextInput
                        value={formatMillisecondsAsSeconds(draft.timeoutMs)}
                        onChangeText={(value) =>
                          updateDraft({
                            ...draft,
                            timeoutMs: optionalPositiveSecondsAsMilliseconds(value),
                          })
                        }
                        placeholder="86400"
                        keyboardType="decimal-pad"
                        size="sm"
                      />
                    </Field>
                  </View>
                  <View style={styles.policyField}>
                    <Field
                      label={t("workflows.editor.taskTimeout")}
                      hint={t("workflows.editor.taskTimeoutHint")}
                    >
                      <WorkflowTextInput
                        value={formatMillisecondsAsSeconds(draft.taskDefaults?.timeoutMs)}
                        onChangeText={(value) =>
                          updateDraft({
                            ...draft,
                            taskDefaults: {
                              ...draft.taskDefaults,
                              timeoutMs: optionalPositiveSecondsAsMilliseconds(value),
                            },
                          })
                        }
                        placeholder="1800"
                        keyboardType="decimal-pad"
                        size="sm"
                      />
                    </Field>
                  </View>
                  <View style={styles.policyField}>
                    <Field
                      label={t("workflows.editor.defaultAttempts")}
                      hint={t("workflows.editor.defaultAttemptsHint")}
                    >
                      <WorkflowTextInput
                        value={draft.taskDefaults?.retry?.maxAttempts?.toString() ?? ""}
                        onChangeText={(value) =>
                          updateDraft({
                            ...draft,
                            taskDefaults: {
                              ...draft.taskDefaults,
                              retry: {
                                maxAttempts: optionalPositiveNumber(value) ?? 1,
                                initialDelayMs: draft.taskDefaults?.retry?.initialDelayMs,
                                maxDelayMs: draft.taskDefaults?.retry?.maxDelayMs,
                                backoffMultiplier: draft.taskDefaults?.retry?.backoffMultiplier,
                                jitter: draft.taskDefaults?.retry?.jitter,
                              },
                            },
                          })
                        }
                        placeholder="3"
                        keyboardType="numeric"
                        size="sm"
                      />
                    </Field>
                  </View>
                </View>
              </View>

              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.sectionTitle}>{t("workflows.editor.flow")}</Text>
                  <Text style={styles.sectionDescription}>{t("workflows.editor.flowHint")}</Text>
                </View>
              </View>
              <WorkflowStepListEditor
                steps={draft.steps}
                rootSteps={draft.steps}
                providerEntries={providersSnapshot.entries ?? []}
                providersLoading={providersSnapshot.isLoading || providersSnapshot.isFetching}
                assistants={assistantsResult.assistants}
                assistantsLoading={assistantsResult.isLoading}
                teams={teamsResult.teams}
                teamsLoading={teamsResult.isLoading}
                promptTemplates={daemonConfig.config?.instructionTemplates ?? []}
                promptTemplatesLoading={daemonConfig.isLoading}
                workflowScripts={scripts}
                currentWorkflowPath={draftPath}
                onChange={(steps) => updateDraft({ ...draft, steps })}
                testID="workflow-step-list"
              />

              <View style={styles.runCard}>
                <View style={styles.runHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>{t("workflows.editor.testRun")}</Text>
                    <Text style={styles.sectionDescription}>
                      {t("workflows.editor.testRunHint")}
                    </Text>
                  </View>
                  <Button
                    variant="default"
                    size="sm"
                    leftIcon={Play}
                    onPress={() => void runWorkflow()}
                    loading={running}
                    disabled={Boolean(validationError)}
                    testID="workflow-run"
                  >
                    {t("workflows.actions.run")}
                  </Button>
                </View>
                <Field
                  label={t("workflows.editor.inputJson")}
                  hint={t("workflows.editor.inputJsonHint")}
                >
                  <WorkflowTextInput
                    value={inputJson}
                    onChangeText={setInputJson}
                    placeholder={DEFAULT_WORKFLOW_INPUT_JSON}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    textAlignVertical="top"
                    style={styles.inputJson}
                  />
                </Field>
                {activeRun ? (
                  <WorkflowRunPanel
                    run={activeRun}
                    onCancel={() => void cancelWorkflow()}
                    onOpenAgent={(agentId) => void openWorkflowAgent(agentId)}
                    cancelling={cancelling}
                  />
                ) : null}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.editorEmpty}>
              <Workflow size={44} color={styles.editorEmptyIcon.color} />
              <Text style={styles.editorEmptyTitle}>{t("workflows.editor.emptyTitle")}</Text>
              <Text style={styles.editorEmptyDescription}>
                {t("workflows.editor.emptyDescription")}
              </Text>
              <Button
                variant="outline"
                leftIcon={Plus}
                onPress={() => void createWorkflow()}
                disabled={!client}
              >
                {t("workflows.actions.new")}
              </Button>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function WorkflowListPane({
  scripts,
  state,
  error,
  selectedPath,
  onSelect,
  onCreate,
  onRetry,
  wide,
}: {
  scripts: WorkflowScriptSummary[];
  state: LoadState;
  error: string | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onCreate: () => void;
  onRetry: () => void;
  wide: boolean;
}) {
  const { t, i18n } = useTranslation();
  let listContent: ReactElement;
  if (state === "loading") {
    listContent = (
      <View style={styles.listCentered}>
        <LoadingSpinner size="small" color={styles.loadingIcon.color} />
      </View>
    );
  } else if (state === "error") {
    listContent = (
      <View style={styles.listCentered}>
        <Text style={styles.listError}>{error ?? t("workflows.messages.loadFailed")}</Text>
        <Button variant="ghost" size="sm" onPress={onRetry}>
          {t("workflows.actions.retry")}
        </Button>
      </View>
    );
  } else if (scripts.length === 0) {
    listContent = (
      <View style={styles.listCentered}>
        <FileCode2 size={28} color={styles.listEmptyIcon.color} />
        <Text style={styles.listEmptyTitle}>{t("workflows.list.empty")}</Text>
        <Button variant="ghost" size="sm" leftIcon={Plus} onPress={onCreate}>
          {t("workflows.actions.create")}
        </Button>
      </View>
    );
  } else {
    listContent = (
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {scripts.map((script) => (
          <Pressable
            key={script.path}
            onPress={() => onSelect(script.path)}
            style={({ hovered, pressed }) => [
              styles.workflowRow,
              selectedPath === script.path && styles.workflowRowSelected,
              hovered && styles.workflowRowHovered,
              pressed && styles.workflowRowPressed,
            ]}
            testID={`workflow-row-${script.name}`}
          >
            <View style={styles.workflowRowIcon}>
              <Workflow size={16} color={styles.workflowRowIconColor.color} />
            </View>
            <View style={styles.workflowRowText}>
              <Text style={styles.workflowRowTitle} numberOfLines={1}>
                {script.name}
              </Text>
              <Text style={styles.workflowRowDescription} numberOfLines={2}>
                {script.description || t("workflows.list.nodeCount", { count: script.stepCount })}
              </Text>
              <Text style={styles.workflowRowMeta}>
                {t("workflows.list.nodeCount", { count: script.stepCount })} ·{" "}
                {formatModifiedAt(script.modifiedAt, i18n.language)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.listPane, !wide && styles.listPaneCompact]}>
      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>{t("workflows.list.title")}</Text>
        <Text style={styles.listCount}>{scripts.length}</Text>
      </View>
      {listContent}
    </View>
  );
}

function WorkflowRunPanel({
  run,
  onCancel,
  onOpenAgent,
  cancelling,
}: {
  run: WorkflowRun;
  onCancel: () => void;
  onOpenAgent: (agentId: string) => void;
  cancelling: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpandedNodeIds(new Set());
  }, [run.id]);
  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);
  let statusIcon: ReactElement;
  if (run.status === "succeeded") {
    statusIcon = <CheckCircle2 size={16} color={styles.runSuccessIcon.color} />;
  } else if (run.status === "failed" || run.status === "cancelled" || run.status === "timed_out") {
    statusIcon = <XCircle size={16} color={styles.runFailureIcon.color} />;
  } else {
    statusIcon = <Circle size={16} color={styles.runPendingIcon.color} />;
  }
  return (
    <View style={styles.runResult}>
      <View style={styles.runStatusRow}>
        {statusIcon}
        <Text style={styles.runStatus}>{t(`workflows.run.status.${run.status}`)}</Text>
        <Text style={styles.runId} numberOfLines={1}>
          {run.id}
        </Text>
        {run.status === "running" ? (
          <Button variant="ghost" size="xs" onPress={onCancel} loading={cancelling}>
            {t("workflows.actions.cancel")}
          </Button>
        ) : null}
      </View>
      <View style={styles.runSummaryGrid}>
        <WorkflowRunValue
          label={t("workflows.run.startedAt")}
          value={formatWorkflowTimestamp(run.startedAt, i18n.language)}
        />
        <WorkflowRunValue
          label={t("workflows.run.endedAt")}
          value={
            run.endedAt
              ? formatWorkflowTimestamp(run.endedAt, i18n.language)
              : t("workflows.run.notFinished")
          }
        />
        <WorkflowRunValue
          label={t("workflows.run.duration")}
          value={formatWorkflowDuration(run.startedAt, run.endedAt)}
        />
        <WorkflowRunValue label={t("workflows.run.control")} value={run.control || "—"} />
      </View>
      <WorkflowPayloadValue label={t("workflows.run.input")} value={run.inputPayload} />
      <WorkflowPayloadValue label={t("workflows.run.outputPayload")} value={run.outputPayload} />
      {run.outputFilePath ? (
        <WorkflowRunValue label={t("workflows.run.outputFile")} value={run.outputFilePath} mono />
      ) : null}
      {run.error ? <Text style={styles.runError}>{run.error}</Text> : null}
      <View style={styles.runNodes}>
        {run.nodeRuns.map((node) => {
          const expanded = expandedNodeIds.has(node.id);
          const { canExpand, canOpenAgent } = deriveWorkflowNodeActions(node);
          const nodeIdentity = deriveWorkflowNodeIdentity(node);
          const linkedAgentId = canOpenAgent ? node.agentId : null;
          const nodeTypeIcon = renderWorkflowNodeTypeIcon(node.stepType);
          const expandIcon = expanded ? (
            <ChevronDown size={13} color={styles.runNodeIcon.color} />
          ) : (
            <ChevronRight size={13} color={styles.runNodeIcon.color} />
          );
          return (
            <View key={node.id} style={styles.runNodeCard}>
              <View style={styles.runNode}>
                <Pressable
                  onPress={() => toggleNode(node.id)}
                  disabled={!canExpand}
                  style={({ hovered, pressed }) => [
                    styles.runNodeToggle,
                    (hovered || pressed) && canExpand ? styles.runNodeInteractive : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  {expandIcon}
                  {nodeTypeIcon}
                  <View style={styles.runNodeIdentity}>
                    <Text style={styles.runNodeName} numberOfLines={1}>
                      {t("workflows.nodes.displayName")}: {nodeIdentity.name || "—"}
                    </Text>
                    <Text style={styles.runNodeId} numberOfLines={1}>
                      {t("workflows.nodes.id")}: {nodeIdentity.id}
                    </Text>
                  </View>
                </Pressable>
                {linkedAgentId ? (
                  <Pressable
                    onPress={() => onOpenAgent(linkedAgentId)}
                    style={({ hovered, pressed }) => [
                      styles.runNodeAgentLink,
                      (hovered || pressed) && styles.runNodeInteractive,
                    ]}
                    accessibilityRole="button"
                  >
                    <ExternalLink size={12} color={styles.runNodeIcon.color} />
                  </Pressable>
                ) : null}
                <Text
                  style={[
                    styles.runNodeStatus,
                    (node.status === "failed" ||
                      node.status === "cancelled" ||
                      node.status === "timed_out") &&
                      styles.runNodeStatusFailed,
                  ]}
                >
                  {t(`workflows.run.status.${node.status}`)}
                  {node.maxAttempts > 1 ? ` · ${node.attempt}/${node.maxAttempts}` : ""}
                </Text>
              </View>
              <WorkflowNodeCore node={node} locale={i18n.language} expanded={expanded} />
              {expanded ? <WorkflowNodeDetails node={node} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function renderWorkflowNodeTypeIcon(stepType: WorkflowNodeRun["stepType"]): ReactElement {
  if (stepType === "agent") {
    return <Bot size={13} color={styles.runNodeIcon.color} />;
  }
  if (stepType === "workflow") {
    return <Workflow size={13} color={styles.runNodeIcon.color} />;
  }
  return <FileCode2 size={13} color={styles.runNodeIcon.color} />;
}

function WorkflowNodeCore({
  node,
  locale,
  expanded,
}: {
  node: WorkflowNodeRun;
  locale: string;
  expanded: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.runNodeCore}>
      <View style={styles.runNodeTiming}>
        <Clock3 size={12} color={styles.runNodeIcon.color} />
        <Text style={styles.runNodeMeta}>
          {formatWorkflowTimestamp(node.startedAt, locale)} →{" "}
          {node.endedAt
            ? formatWorkflowTimestamp(node.endedAt, locale)
            : t("workflows.run.notFinished")}{" "}
          · {formatWorkflowDuration(node.startedAt, node.endedAt)}
        </Text>
      </View>
      <WorkflowPayloadValue
        label={t("workflows.run.input")}
        value={node.inputPayload}
        compact={!expanded}
      />
      <WorkflowPayloadValue
        label={t("workflows.run.outputPayload")}
        value={node.outputPayload}
        compact={!expanded}
      />
      {node.error ? <Text style={styles.runError}>{node.error}</Text> : null}
    </View>
  );
}

function WorkflowNodeDetails({ node }: { node: WorkflowNodeRun }) {
  const { t } = useTranslation();
  let outputContent: ReactElement | null = null;
  if (node.output && node.stepType === "bash") {
    outputContent = <WorkflowBashOutput value={node.output} />;
  } else if (node.stepType === "agent") {
    outputContent = (
      <WorkflowAgentOutput
        prompt={node.agentPrompt}
        response={node.agentResponse}
        processOutput={node.output}
        legacyOutput={node.output}
      />
    );
  } else if (node.output) {
    outputContent = (
      <WorkflowPayloadValue
        label={t("workflows.run.nodeOutput")}
        value={node.output}
        preserveText
      />
    );
  }
  return (
    <View style={styles.runNodeDetails}>
      {outputContent}
      <WorkflowRunValue
        label={t("workflows.run.iteration")}
        value={node.iterationPath.length > 0 ? node.iterationPath.join(" / ") : "—"}
      />
      {node.errorCode ? (
        <WorkflowRunValue label={t("workflows.run.errorCode")} value={node.errorCode} mono />
      ) : null}
      {node.workflowPath ? (
        <WorkflowRunValue label={t("workflows.run.workflow")} value={node.workflowPath} mono />
      ) : null}
      {node.workflowRunId ? (
        <WorkflowRunValue
          label={t("workflows.run.workflowRunId")}
          value={node.workflowRunId}
          mono
        />
      ) : null}
    </View>
  );
}

function WorkflowBashOutput({ value }: { value: string }) {
  const { t } = useTranslation();
  const sections = parseWorkflowProcessOutput(value);
  return (
    <View style={styles.runValue}>
      <Text style={styles.runValueLabel}>{t("workflows.run.processOutput")}</Text>
      <View style={styles.runProcessSections}>
        {sections.map((section) => (
          <View key={section.stream} style={styles.runProcessSection}>
            <Text style={styles.runProcessLabel}>{t(`workflows.run.${section.stream}`)}</Text>
            <Text style={styles.runPayloadValue} selectable>
              {section.value || "—"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WorkflowPayloadValue({
  label,
  value,
  compact = false,
  preserveText = false,
}: {
  label: string;
  value: string | null;
  compact?: boolean;
  preserveText?: boolean;
}) {
  return (
    <View style={styles.runValue}>
      <Text style={styles.runValueLabel}>{label}</Text>
      <Text
        style={[styles.runPayloadValue, compact && styles.runPayloadValueCompact]}
        numberOfLines={compact ? 3 : undefined}
        selectable
      >
        {preserveText ? value || "—" : formatWorkflowPayload(value)}
      </Text>
    </View>
  );
}

function WorkflowRunValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.runValue}>
      <Text style={styles.runValueLabel}>{label}</Text>
      <Text style={[styles.runValueText, mono && styles.runValueMono]} selectable>
        {value}
      </Text>
    </View>
  );
}

function formatModifiedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWorkflowTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatWorkflowDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "—";
  }
  const durationMs = end - start;
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatWorkflowPayload(value: string | null): string {
  if (!value) {
    return "—";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function optionalPositiveNumber(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function optionalPositiveSecondsAsMilliseconds(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : undefined;
}

function formatMillisecondsAsSeconds(value: number | undefined): string {
  return value === undefined ? "" : String(value / 1000);
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  hostBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  hostSelector: {
    width: 220,
  },
  hostLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  hostHint: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  workspace: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
  workspaceCompact: {
    flexDirection: "column",
  },
  listPane: {
    width: 290,
    minHeight: 0,
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  listPaneCompact: {
    width: "100%",
    maxHeight: 250,
    borderRightWidth: 0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  listHeading: {
    height: 44,
    paddingHorizontal: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  listTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listCount: {
    minWidth: 22,
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: theme.spacing[1],
    textAlign: "center",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  listCentered: {
    flex: 1,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[4],
  },
  listError: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
  listEmptyIcon: {
    color: theme.colors.foregroundExtraMuted,
  },
  loadingIcon: {
    color: theme.colors.foregroundMuted,
  },
  listEmptyTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: theme.spacing[2],
    gap: theme.spacing[1],
  },
  workflowRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
  },
  workflowRowSelected: {
    backgroundColor: theme.colors.surface3,
    borderColor: theme.colors.border,
  },
  workflowRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  workflowRowPressed: {
    opacity: theme.opacity[50],
  },
  workflowRowIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface3,
  },
  workflowRowIconColor: {
    color: theme.colors.foregroundMuted,
  },
  workflowRowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  workflowRowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  workflowRowDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
  },
  workflowRowMeta: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  editorPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  editorScroll: {
    flex: 1,
  },
  editorContent: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    padding: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingBottom: theme.spacing[12],
    gap: theme.spacing[6],
  },
  editorToolbar: {
    flexDirection: { xs: "column", md: "row" },
    alignItems: { xs: "stretch", md: "center" },
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  editorTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  editorTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  editorTitleInput: {
    flex: 1,
    minWidth: 120,
    maxWidth: 480,
    minHeight: 36,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
  },
  editorPath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  editorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  validationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.statusDanger,
  },
  validationText: {
    flex: 1,
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  validationIcon: {
    color: theme.colors.statusDanger,
  },
  metadataCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  metadataCountRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  metadataCount: {
    width: 72,
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  metadataCountValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  metadataCountLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  policyGrid: {
    flexDirection: { xs: "column", md: "row" },
    gap: theme.spacing[3],
  },
  policyField: {
    flex: 1,
    minWidth: 0,
  },
  descriptionInput: {
    minHeight: 72,
  },
  inputJson: {
    minHeight: 144,
    fontFamily: theme.fontFamily.mono,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  sectionDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  runCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  runHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  runResult: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  runSummaryGrid: {
    flexDirection: { xs: "column", md: "row" },
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  runStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  runStatus: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textTransform: "capitalize",
  },
  runSuccessIcon: {
    color: theme.colors.statusSuccess,
  },
  runFailureIcon: {
    color: theme.colors.statusDanger,
  },
  runPendingIcon: {
    color: theme.colors.statusWarning,
  },
  runId: {
    flex: 1,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    textAlign: "right",
  },
  runOutput: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  runError: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
  },
  runNodes: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  runNodeCard: {
    overflow: "hidden",
    borderRadius: theme.borderRadius.sm,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  runNode: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
  },
  runNodeToggle: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    marginVertical: -theme.spacing[1],
    marginLeft: -theme.spacing[1],
  },
  runNodeAgentLink: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing[1],
    marginVertical: -theme.spacing[1],
  },
  runNodeInteractive: {
    backgroundColor: theme.colors.surface3,
  },
  runNodeName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  runNodeIdentity: {
    minWidth: 0,
    flex: 1,
    gap: 1,
  },
  runNodeId: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  runNodeIcon: {
    color: theme.colors.foregroundMuted,
  },
  runNodeStatus: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.xs,
  },
  runNodeStatusFailed: {
    color: theme.colors.statusDanger,
  },
  runNodeCore: {
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
  runNodeTiming: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  runNodeMeta: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  runNodeDetails: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  runValue: {
    minWidth: 0,
    gap: theme.spacing[1],
  },
  runValueLabel: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  runValueText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  runValueMono: {
    fontFamily: theme.fontFamily.mono,
  },
  runPayloadValue: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.45),
    fontFamily: theme.fontFamily.mono,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface0,
  },
  runPayloadValueCompact: {
    maxHeight: 76,
  },
  runProcessSections: {
    gap: theme.spacing[2],
  },
  runProcessSection: {
    gap: theme.spacing[1],
  },
  runProcessLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    fontFamily: theme.fontFamily.mono,
  },
  editorEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[6],
  },
  editorEmptyIcon: {
    color: theme.colors.foregroundExtraMuted,
  },
  editorEmptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  editorEmptyDescription: {
    maxWidth: 420,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
