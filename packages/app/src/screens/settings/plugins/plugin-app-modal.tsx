import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Monitor } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppComponent,
  PluginAppDefinition,
  PluginAppState,
  PluginHttpJob,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import {
  isTerminalPluginAppJob,
  usePluginAppJob,
} from "@/screens/settings/plugins/use-plugin-app-job";
import {
  resolvePluginAppComponentSlot,
  type PluginAppComponentSlots,
} from "./plugin-app-component-slot";
import { presentPluginAppResult } from "./plugin-app-result-model";
import {
  PluginAppHtmlPreviewModal,
  type PluginAppHtmlPreview,
} from "./plugin-app-html-preview-modal";
import {
  PluginProjectBoundary,
  type PluginProjectContext,
} from "@/plugins/project/plugin-project-boundary";

const EMPTY_FORM_VALUES: Record<string, unknown> = {};
const EMPTY_HIDDEN_FIELD_IDS: readonly string[] = [];
const EMPTY_COMPONENT_SLOTS: PluginAppComponentSlots = {};

function initialForm(
  document: PluginAppState["document"],
  fixedValues: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const component of document?.components ?? []) {
    if (
      component.type === "text_input" ||
      component.type === "textarea" ||
      component.type === "number_input" ||
      component.type === "select" ||
      component.type === "checkbox"
    ) {
      result[component.id] = component.defaultValue ?? (component.type === "checkbox" ? false : "");
    }
  }
  return { ...result, ...fixedValues };
}

function prettyJson(value: unknown): string {
  if (value === undefined || value === null) return "暂无结果";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function jobStatusText(job: PluginHttpJob | null, queryError: string | null): string {
  if (queryError) return `状态查询失败：${queryError}`;
  if (!job) return "尚未启动";
  const status = {
    draft: "草稿",
    queued: "等待处理",
    running: "处理中",
    succeeded: "已成功",
    failed: "失败",
    cancelled: "已取消",
    timed_out: "已超时",
  }[job.status];
  if (job.error) return `${status}：${job.error}`;
  return status;
}

function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (error) return String(error);
  return null;
}

type FieldComponent = Extract<
  PluginAppComponent,
  {
    type: "text_input" | "textarea" | "number_input" | "select" | "checkbox";
  }
>;

type DisplayComponent = Exclude<PluginAppComponent, FieldComponent>;

function isFieldComponent(component: PluginAppComponent): component is FieldComponent {
  return (
    component.type === "text_input" ||
    component.type === "textarea" ||
    component.type === "number_input" ||
    component.type === "select" ||
    component.type === "checkbox"
  );
}

function SelectPreview({
  component,
  form,
  onFormChange,
}: {
  component: Extract<FieldComponent, { type: "select" }>;
  form: Record<string, unknown>;
  onFormChange: (id: string, value: unknown) => void;
}) {
  const rawValue = form[component.id];
  const value = typeof rawValue === "string" ? rawValue : null;
  const selectedDisplay = useMemo(() => {
    const selected = component.options.find((option) => option.value === value);
    return selected ? { label: selected.label } : null;
  }, [component.options, value]);
  const options = useMemo(
    () =>
      component.options.map((option) => ({
        id: option.value,
        value: option.value,
        label: option.label,
      })),
    [component.options],
  );
  const handleChange = useCallback(
    (nextValue: string) => onFormChange(component.id, nextValue),
    [component.id, onFormChange],
  );
  return (
    <SelectField
      label={component.label}
      value={value}
      selectedDisplay={selectedDisplay}
      options={options}
      onChange={handleChange}
      placeholder={component.placeholder ?? "请选择"}
      emptyText="没有可用选项"
      hint={component.description}
    />
  );
}

function FieldPreview({
  component,
  form,
  onFormChange,
}: {
  component: FieldComponent;
  form: Record<string, unknown>;
  onFormChange: (id: string, value: unknown) => void;
}) {
  const handleTextChange = useCallback(
    (value: string) => onFormChange(component.id, value),
    [component.id, onFormChange],
  );
  const handleNumberChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      onFormChange(component.id, value.trim() === "" || Number.isNaN(parsed) ? value : parsed);
    },
    [component.id, onFormChange],
  );
  const handleBooleanChange = useCallback(
    (value: boolean) => onFormChange(component.id, value),
    [component.id, onFormChange],
  );

  switch (component.type) {
    case "text_input":
      return (
        <Field label={component.label} hint={component.description}>
          <FormTextInput
            value={String(form[component.id] ?? "")}
            onChangeText={handleTextChange}
            placeholder={component.placeholder}
          />
        </Field>
      );
    case "textarea":
      return (
        <Field label={component.label} hint={component.description}>
          <FormTextInput
            value={String(form[component.id] ?? "")}
            onChangeText={handleTextChange}
            placeholder={component.placeholder}
            multiline
            textInputStyle={styles.textareaInput}
          />
        </Field>
      );
    case "number_input":
      return (
        <Field label={component.label} hint={component.description}>
          <FormTextInput
            value={String(form[component.id] ?? "")}
            onChangeText={handleNumberChange}
            placeholder={component.placeholder}
            keyboardType="numeric"
          />
        </Field>
      );
    case "select":
      return <SelectPreview component={component} form={form} onFormChange={onFormChange} />;
    case "checkbox":
      return (
        <View style={styles.checkboxRow}>
          <View style={styles.checkboxText}>
            <Text style={styles.fieldLabel}>{component.label}</Text>
            {component.description ? (
              <Text style={styles.fieldHint}>{component.description}</Text>
            ) : null}
          </View>
          <Switch value={Boolean(form[component.id])} onValueChange={handleBooleanChange} />
        </View>
      );
  }
}

function buttonVariant(
  variant: Extract<DisplayComponent, { type: "button" }>["variant"],
): "default" | "outline" | "destructive" {
  if (variant === "destructive") return "destructive";
  if (variant === "secondary") return "outline";
  return "default";
}

function DisplayPreview({
  component,
  job,
  jobQueryError,
  jobQueryPending,
  busy,
  onRefreshJob,
  onRun,
}: {
  component: DisplayComponent;
  job: PluginHttpJob | null;
  jobQueryError: string | null;
  jobQueryPending: boolean;
  busy: boolean;
  onRefreshJob: () => void;
  onRun: (componentId: string) => void;
}) {
  const handleRun = useCallback(() => onRun(component.id), [component.id, onRun]);
  switch (component.type) {
    case "heading":
      return (
        <Text style={component.level === 1 ? styles.heading1 : styles.heading2}>
          {component.text}
        </Text>
      );
    case "text":
      return <Text style={styles.bodyText}>{component.text}</Text>;
    case "button":
      return (
        <Button
          variant={buttonVariant(component.variant)}
          onPress={handleRun}
          loading={busy}
          disabled={busy}
        >
          {component.label}
        </Button>
      );
    case "status":
      return (
        <View style={styles.outputCard}>
          <Text style={styles.outputLabel}>{component.label ?? "Status"}</Text>
          <Text selectable style={styles.statusText}>
            {jobStatusText(job, jobQueryError)}
          </Text>
          {job?.workflowRunId ? (
            <Text selectable style={styles.metadataText}>
              Workflow Run ID: {job.workflowRunId}
            </Text>
          ) : null}
          {jobQueryError && job ? (
            <Button
              variant="outline"
              onPress={onRefreshJob}
              loading={jobQueryPending}
              disabled={jobQueryPending}
            >
              重新查询
            </Button>
          ) : null}
        </View>
      );
    case "result": {
      const result = presentPluginAppResult(job?.result);
      return (
        <View style={styles.outputCard}>
          <Text style={styles.outputLabel}>{component.label ?? "结果"}</Text>
          <Text selectable style={result.kind === "json" ? styles.codeText : styles.resultText}>
            {result.text}
          </Text>
        </View>
      );
    }
    case "json":
      return (
        <View style={styles.outputCard}>
          <Text style={styles.outputLabel}>{component.label ?? "JSON"}</Text>
          <Text selectable style={styles.codeText}>
            {prettyJson(component.value ?? job?.result)}
          </Text>
        </View>
      );
  }
}

function PreviewComponent({
  component,
  form,
  job,
  jobQueryError,
  jobQueryPending,
  busy,
  onFormChange,
  onRefreshJob,
  onRun,
}: {
  component: PluginAppComponent;
  form: Record<string, unknown>;
  job: PluginHttpJob | null;
  jobQueryError: string | null;
  jobQueryPending: boolean;
  busy: boolean;
  onFormChange: (id: string, value: unknown) => void;
  onRefreshJob: () => void;
  onRun: (componentId: string) => void;
}) {
  if (isFieldComponent(component)) {
    return <FieldPreview component={component} form={form} onFormChange={onFormChange} />;
  }
  return (
    <DisplayPreview
      component={component}
      job={job}
      jobQueryError={jobQueryError}
      jobQueryPending={jobQueryPending}
      busy={busy}
      onRefreshJob={onRefreshJob}
      onRun={onRun}
    />
  );
}

interface PluginAppModalProps {
  visible: boolean;
  serverId: string;
  plugin: PluginSummary | null;
  appDefinition: PluginAppDefinition | null;
  onClose: () => void;
}

function usePluginAppController({
  visible,
  serverId,
  plugin,
  appDefinition,
  projectId,
  fixedFormValues = EMPTY_FORM_VALUES,
  initialFormValues = EMPTY_FORM_VALUES,
  prepareSubmission,
  onFormValuesChange,
  onJobSubmitted,
}: Omit<PluginAppModalProps, "onClose"> & {
  projectId: string;
  fixedFormValues?: Record<string, unknown>;
  initialFormValues?: Record<string, unknown>;
  prepareSubmission?: (
    form: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  onFormValuesChange?: (form: Record<string, unknown>) => void;
  onJobSubmitted?: (job: PluginHttpJob) => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const [app, setApp] = useState<PluginAppState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [submittedJob, setSubmittedJob] = useState<PluginHttpJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobQuery = usePluginAppJob({
    active: visible,
    client,
    initialJob: submittedJob,
    serverId,
  });
  const job = jobQuery.data ?? submittedJob;
  const jobQueryError = errorMessage(jobQuery.error);
  const running = submitting || Boolean(job && !isTerminalPluginAppJob(job) && !jobQueryError);

  useEffect(() => {
    if (!visible || !client || !plugin?.pluginId || !appDefinition) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setApp(null);
    setSubmittedJob(null);
    void client
      .getPluginApp(plugin.pluginId, appDefinition.id, projectId)
      .then((result) => {
        if (cancelled) return undefined;
        if (result.error || !result.app) throw new Error(result.error ?? "未找到插件页面");
        setApp(result.app);
        const nextForm = initialForm(result.app.document, {
          ...initialFormValues,
          ...fixedFormValues,
        });
        setForm(nextForm);
        onFormValuesChange?.(nextForm);
        return undefined;
      })
      .catch((nextError: unknown) => {
        if (!cancelled)
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        return undefined;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    appDefinition,
    client,
    fixedFormValues,
    initialFormValues,
    onFormValuesChange,
    plugin?.pluginId,
    projectId,
    visible,
  ]);

  const handleGenerate = useCallback(() => {
    if (!client || !plugin?.pluginId || !appDefinition || !prompt.trim()) return;
    setGenerating(true);
    setError(null);
    void client
      .generatePluginApp(plugin.pluginId, appDefinition.id, projectId, prompt.trim())
      .then((result) => {
        if (result.error || !result.app) throw new Error(result.error ?? "页面生成失败");
        setApp(result.app);
        const nextForm = initialForm(result.app.document, {
          ...initialFormValues,
          ...fixedFormValues,
        });
        setForm(nextForm);
        onFormValuesChange?.(nextForm);
        setPrompt("");
        return undefined;
      })
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        return undefined;
      })
      .finally(() => setGenerating(false));
  }, [
    appDefinition,
    client,
    fixedFormValues,
    initialFormValues,
    onFormValuesChange,
    plugin?.pluginId,
    projectId,
    prompt,
  ]);

  const handleFormChange = useCallback(
    (id: string, value: unknown) => {
      setForm((current) => {
        const next = { ...current, [id]: value };
        onFormValuesChange?.(next);
        return next;
      });
    },
    [onFormValuesChange],
  );

  const handleRun = useCallback(
    (componentId: string) => {
      if (!client || !plugin?.pluginId || !appDefinition) return;
      setSubmitting(true);
      setError(null);
      setSubmittedJob(null);
      void Promise.resolve(
        prepareSubmission?.({ ...form, ...fixedFormValues }) ?? {
          ...form,
          ...fixedFormValues,
        },
      )
        .then((submissionForm) =>
          client.submitPluginAppAction({
            pluginId: plugin.pluginId!,
            appId: appDefinition.id,
            projectId,
            componentId,
            form: submissionForm,
          }),
        )
        .then((result) => {
          if (result.error || !result.job) throw new Error(result.error ?? "操作执行失败");
          setSubmittedJob(result.job);
          onJobSubmitted?.(result.job);
          return undefined;
        })
        .catch((nextError: unknown) => {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
          return undefined;
        })
        .finally(() => setSubmitting(false));
    },
    [
      appDefinition,
      client,
      fixedFormValues,
      form,
      onJobSubmitted,
      plugin?.pluginId,
      prepareSubmission,
      projectId,
    ],
  );

  const loadHtmlPreview = useCallback(async (): Promise<PluginAppHtmlPreview> => {
    if (!client || !plugin?.pluginId || !appDefinition) {
      throw new Error("Host 未连接或插件不可用");
    }
    const result = await client.getPluginAppHtmlPreview({
      pluginId: plugin.pluginId,
      appId: appDefinition.id,
      projectId,
    });
    if (result.error || !result.html || !result.htmlPath) {
      throw new Error(result.error ?? "当前页面尚未生成 HTML 预览");
    }
    return { html: result.html, htmlPath: result.htmlPath };
  }, [appDefinition, client, plugin?.pluginId, projectId]);

  return {
    app,
    prompt,
    setPrompt,
    form,
    job,
    loading,
    generating,
    running,
    jobQueryError,
    jobQueryPending: jobQuery.isFetching,
    error,
    handleGenerate,
    handleFormChange,
    refreshJob: jobQuery.refetch,
    handleRun,
    loadHtmlPreview,
  };
}

function ConversationPane({
  app,
  prompt,
  loading,
  generating,
  onPromptChange,
  onGenerate,
}: {
  app: PluginAppState | null;
  prompt: string;
  loading: boolean;
  generating: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
}) {
  return (
    <View style={styles.conversationColumn}>
      <Text style={styles.sectionTitle}>页面生成与修改</Text>
      <Text style={styles.sectionHint}>
        在这里提交一次页面生成指令。日常讨论请点击上方“前往 Project
        对话”，不要在插件页面维护聊天记录。
      </Text>
      <FormTextInput
        value={prompt}
        onChangeText={onPromptChange}
        placeholder="例如：生成一个故障分析表单，提交到 processor 服务，并展示运行状态和结果"
        multiline
        textInputStyle={styles.promptInput}
      />
      <Button
        variant="default"
        onPress={onGenerate}
        loading={generating}
        disabled={generating || !prompt.trim()}
      >
        {app?.document ? "提交修改指令" : "生成页面"}
      </Button>
      {loading ? <Text style={styles.sectionHint}>正在加载页面定义…</Text> : null}
    </View>
  );
}

function PreviewPane({
  app,
  form,
  job,
  loading,
  running,
  jobQueryError,
  jobQueryPending,
  onFormChange,
  onRefreshJob,
  onRun,
  hiddenFieldIds,
  componentSlots,
  title,
  canPreviewHtml,
  previewingHtml,
  onPreviewHtml,
}: {
  app: PluginAppState | null;
  form: Record<string, unknown>;
  job: PluginHttpJob | null;
  loading: boolean;
  running: boolean;
  jobQueryError: string | null;
  jobQueryPending: boolean;
  onFormChange: (id: string, value: unknown) => void;
  onRefreshJob: () => void;
  onRun: (componentId: string) => void;
  hiddenFieldIds: ReadonlySet<string>;
  componentSlots: PluginAppComponentSlots;
  title: string;
  canPreviewHtml: boolean;
  previewingHtml: boolean;
  onPreviewHtml: () => void;
}) {
  return (
    <View style={styles.previewColumn}>
      <View style={styles.previewHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {canPreviewHtml ? (
          <Button
            size="xs"
            variant="outline"
            leftIcon={Monitor}
            loading={previewingHtml}
            disabled={previewingHtml}
            onPress={onPreviewHtml}
          >
            浏览器预览
          </Button>
        ) : null}
      </View>
      {app?.document?.description ? (
        <Text style={styles.sectionHint}>{app.document.description}</Text>
      ) : null}
      <View style={styles.previewCard}>
        {loading ? <Text style={styles.sectionHint}>加载中…</Text> : null}
        {!loading && !app?.document ? (
          <Text style={styles.sectionHint}>请在左侧描述需要的界面，再让 Agent 生成页面。</Text>
        ) : null}
        {app?.document?.components.map((component) => {
          if (hiddenFieldIds.has(component.id)) return null;
          if (Object.hasOwn(componentSlots, component.id)) {
            const slot = componentSlots[component.id];
            if (slot !== undefined) {
              return (
                <View key={component.id}>
                  {resolvePluginAppComponentSlot(slot, {
                    component,
                    form,
                    value: form[component.id],
                    onChange: (value) => onFormChange(component.id, value),
                  })}
                </View>
              );
            }
          }
          return (
            <PreviewComponent
              key={component.id}
              component={component}
              form={form}
              job={job}
              jobQueryError={jobQueryError}
              jobQueryPending={jobQueryPending}
              busy={running}
              onFormChange={onFormChange}
              onRefreshJob={onRefreshJob}
              onRun={onRun}
            />
          );
        })}
      </View>
    </View>
  );
}

type PluginAppController = ReturnType<typeof usePluginAppController>;

function PluginAppContent({
  controller,
  showConversation = true,
  hiddenFieldIds = EMPTY_HIDDEN_FIELD_IDS,
  componentSlots = EMPTY_COMPONENT_SLOTS,
  previewTitle = "实时预览",
  supportsHtmlPreview,
}: {
  controller: PluginAppController;
  showConversation?: boolean;
  hiddenFieldIds?: readonly string[];
  componentSlots?: PluginAppComponentSlots;
  previewTitle?: string;
  supportsHtmlPreview: boolean;
}) {
  const {
    app,
    prompt,
    setPrompt,
    form,
    job,
    loading,
    generating,
    running,
    jobQueryError,
    jobQueryPending,
    error,
    handleGenerate,
    handleFormChange,
    refreshJob,
    handleRun,
    loadHtmlPreview,
  } = controller;
  const [htmlPreviewVisible, setHtmlPreviewVisible] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<PluginAppHtmlPreview | null>(null);
  const [htmlPreviewError, setHtmlPreviewError] = useState<string | null>(null);
  const [previewingHtml, setPreviewingHtml] = useState(false);
  const handleRefreshJob = useCallback(() => {
    void refreshJob();
  }, [refreshJob]);
  const hiddenFields = useMemo(() => new Set(hiddenFieldIds), [hiddenFieldIds]);
  const handlePreviewHtml = useCallback(() => {
    setHtmlPreviewVisible(true);
    setPreviewingHtml(true);
    setHtmlPreviewError(null);
    void loadHtmlPreview()
      .then(setHtmlPreview)
      .catch((nextError: unknown) =>
        setHtmlPreviewError(nextError instanceof Error ? nextError.message : String(nextError)),
      )
      .finally(() => setPreviewingHtml(false));
  }, [loadHtmlPreview]);
  const closeHtmlPreview = useCallback(() => setHtmlPreviewVisible(false), []);

  return (
    <>
      <View style={[styles.columns, !showConversation && styles.singleColumn]}>
        {showConversation ? (
          <ConversationPane
            app={app}
            prompt={prompt}
            loading={loading}
            generating={generating}
            onPromptChange={setPrompt}
            onGenerate={handleGenerate}
          />
        ) : null}
        <PreviewPane
          app={app}
          form={form}
          job={job}
          loading={loading}
          running={running}
          jobQueryError={jobQueryError}
          jobQueryPending={jobQueryPending}
          onFormChange={handleFormChange}
          onRefreshJob={handleRefreshJob}
          onRun={handleRun}
          hiddenFieldIds={hiddenFields}
          componentSlots={componentSlots}
          title={previewTitle}
          canPreviewHtml={supportsHtmlPreview && Boolean(app?.document)}
          previewingHtml={previewingHtml}
          onPreviewHtml={handlePreviewHtml}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PluginAppHtmlPreviewModal
        visible={htmlPreviewVisible}
        preview={htmlPreview}
        error={htmlPreviewError}
        onClose={closeHtmlPreview}
      />
    </>
  );
}

export function PluginAppSurface({
  active,
  serverId,
  plugin,
  appDefinition,
  projectId,
  fixedFormValues,
  initialFormValues,
  hiddenFieldIds,
  componentSlots,
  showConversation = true,
  prepareSubmission,
  onFormValuesChange,
  onJobSubmitted,
  previewTitle,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  projectId: string;
  fixedFormValues?: Record<string, unknown>;
  initialFormValues?: Record<string, unknown>;
  hiddenFieldIds?: readonly string[];
  componentSlots?: PluginAppComponentSlots;
  showConversation?: boolean;
  prepareSubmission?: (
    form: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  onFormValuesChange?: (form: Record<string, unknown>) => void;
  onJobSubmitted?: (job: PluginHttpJob) => void;
  previewTitle?: string;
}) {
  const supportsProjectScopedApps = useHostFeature(serverId, "pluginProjectScopedApps");
  const supportsHtmlPreview = useHostFeature(serverId, "pluginAppHtmlPreview");
  const controller = usePluginAppController({
    visible: active && supportsProjectScopedApps,
    serverId,
    plugin,
    appDefinition,
    projectId,
    fixedFormValues,
    initialFormValues,
    prepareSubmission,
    onFormValuesChange,
    onJobSubmitted,
  });
  if (!supportsProjectScopedApps) {
    return (
      <View style={styles.previewCard}>
        <Text style={styles.errorText}>
          当前 Host 不支持以 Project 为核心的插件。请更新并重启 daemon。
        </Text>
      </View>
    );
  }
  return (
    <PluginAppContent
      controller={controller}
      showConversation={showConversation}
      hiddenFieldIds={hiddenFieldIds}
      componentSlots={componentSlots}
      previewTitle={previewTitle}
      supportsHtmlPreview={supportsHtmlPreview}
    />
  );
}

function mergeUniqueFieldIds(...groups: readonly (readonly string[] | undefined)[]): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []))];
}

function ProjectBoundPluginAppSurface({
  active,
  serverId,
  plugin,
  appDefinition,
  context,
  fixedFormValues,
  hiddenFieldIds,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  context: PluginProjectContext;
  fixedFormValues?: Record<string, unknown>;
  hiddenFieldIds?: readonly string[];
}) {
  const mergedFixedFormValues = useMemo(
    () => ({ ...fixedFormValues, ...context.fixedFormValues }),
    [context.fixedFormValues, fixedFormValues],
  );
  const mergedHiddenFieldIds = useMemo(
    () => mergeUniqueFieldIds(context.hiddenFieldIds, hiddenFieldIds),
    [context.hiddenFieldIds, hiddenFieldIds],
  );
  return (
    <PluginAppSurface
      active={active}
      serverId={serverId}
      plugin={plugin}
      appDefinition={appDefinition}
      projectId={context.projectId}
      fixedFormValues={mergedFixedFormValues}
      hiddenFieldIds={mergedHiddenFieldIds}
    />
  );
}

export function ProjectScopedPluginAppSurface({
  active,
  serverId,
  plugin,
  appDefinition,
  initialProjectId,
  fixedFormValues,
  hiddenFieldIds,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  initialProjectId?: string;
  fixedFormValues?: Record<string, unknown>;
  hiddenFieldIds?: readonly string[];
}) {
  return (
    <PluginProjectBoundary
      active={active}
      serverId={serverId}
      pluginId={plugin.pluginId}
      appDefinition={appDefinition}
      initialProjectId={initialProjectId}
    >
      {(context) => (
        <ProjectBoundPluginAppSurface
          active={active}
          serverId={serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          context={context}
          fixedFormValues={fixedFormValues}
          hiddenFieldIds={hiddenFieldIds}
        />
      )}
    </PluginProjectBoundary>
  );
}

export function PluginAppModal({
  visible,
  serverId,
  plugin,
  appDefinition,
  onClose,
}: PluginAppModalProps) {
  const header = useMemo(
    () => ({
      title: appDefinition?.initialDocument?.title ?? appDefinition?.id ?? "插件应用",
      subtitle: plugin ? `${plugin.displayName} · Project 插件` : undefined,
    }),
    [appDefinition?.id, appDefinition?.initialDocument?.title, plugin],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      header={header}
      onClose={onClose}
      desktopMaxWidth={1040}
      scrollable
      testID="plugin-app-modal"
    >
      {plugin && appDefinition ? (
        <PluginProjectBoundary
          active={visible}
          serverId={serverId}
          pluginId={plugin.pluginId}
          appDefinition={appDefinition}
        >
          {(context) => (
            <ProjectBoundPluginAppSurface
              active={visible}
              serverId={serverId}
              plugin={plugin}
              appDefinition={appDefinition}
              context={context}
            />
          )}
        </PluginProjectBoundary>
      ) : null}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: theme.spacing[6],
  },
  singleColumn: {
    flexDirection: "column",
  },
  conversationColumn: {
    flex: 1,
    minWidth: 300,
    gap: theme.spacing[3],
  },
  previewColumn: {
    flex: 1.2,
    minWidth: 340,
    gap: theme.spacing[2],
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  sectionHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  promptInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  previewCard: {
    ...settingsStyles.card,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    minHeight: 360,
  },
  heading1: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.medium,
  },
  heading2: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  bodyText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  textareaInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  checkboxText: {
    flex: 1,
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  fieldHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  outputCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  outputLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  statusText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  metadataText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  codeText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  resultText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 28,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
