import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
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
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

function initialForm(document: PluginAppState["document"]): Record<string, unknown> {
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
  return result;
}

function prettyJson(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function jobStatusText(job: PluginHttpJob | null): string {
  if (!job) return "Not started";
  if (job.error) return `${job.status}: ${job.error}`;
  return job.status;
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
      placeholder={component.placeholder ?? "Select"}
      emptyText="No options"
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
  busy,
  onRun,
}: {
  component: DisplayComponent;
  job: PluginHttpJob | null;
  busy: boolean;
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
          <Text style={styles.statusText}>{jobStatusText(job)}</Text>
        </View>
      );
    case "result":
      return (
        <View style={styles.outputCard}>
          <Text style={styles.outputLabel}>{component.label ?? "Result"}</Text>
          <Text selectable style={styles.codeText}>
            {prettyJson(job?.result)}
          </Text>
        </View>
      );
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
  busy,
  onFormChange,
  onRun,
}: {
  component: PluginAppComponent;
  form: Record<string, unknown>;
  job: PluginHttpJob | null;
  busy: boolean;
  onFormChange: (id: string, value: unknown) => void;
  onRun: (componentId: string) => void;
}) {
  if (isFieldComponent(component)) {
    return <FieldPreview component={component} form={form} onFormChange={onFormChange} />;
  }
  return <DisplayPreview component={component} job={job} busy={busy} onRun={onRun} />;
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
}: Omit<PluginAppModalProps, "onClose">) {
  const client = useHostRuntimeClient(serverId);
  const [app, setApp] = useState<PluginAppState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [job, setJob] = useState<PluginHttpJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !client || !plugin?.pluginId || !appDefinition) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setApp(null);
    setJob(null);
    void client
      .getPluginApp(plugin.pluginId, appDefinition.id)
      .then((result) => {
        if (cancelled) return undefined;
        if (result.error || !result.app) throw new Error(result.error ?? "Plugin app not found");
        setApp(result.app);
        setForm(initialForm(result.app.document));
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
  }, [appDefinition, client, plugin?.pluginId, visible]);

  useEffect(() => {
    if (!client || !job || TERMINAL_JOB_STATUSES.has(job.status)) {
      if (job && TERMINAL_JOB_STATUSES.has(job.status)) setRunning(false);
      return;
    }
    const timer = setTimeout(() => {
      void client
        .getPluginAppJob(job.id)
        .then((result) => {
          if (result.job) setJob(result.job);
          if (result.error) setError(result.error);
          return undefined;
        })
        .catch((nextError: unknown) => {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
          return undefined;
        });
    }, 1_000);
    return () => clearTimeout(timer);
  }, [client, job]);

  const handleGenerate = useCallback(() => {
    if (!client || !plugin?.pluginId || !appDefinition || !prompt.trim()) return;
    setGenerating(true);
    setError(null);
    void client
      .generatePluginApp(plugin.pluginId, appDefinition.id, prompt.trim())
      .then((result) => {
        if (result.error || !result.app) throw new Error(result.error ?? "Generation failed");
        setApp(result.app);
        setForm(initialForm(result.app.document));
        setPrompt("");
        return undefined;
      })
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        return undefined;
      })
      .finally(() => setGenerating(false));
  }, [appDefinition, client, plugin?.pluginId, prompt]);

  const handleFormChange = useCallback((id: string, value: unknown) => {
    setForm((current) => ({ ...current, [id]: value }));
  }, []);

  const handleRun = useCallback(
    (componentId: string) => {
      if (!client || !plugin?.pluginId || !appDefinition) return;
      setRunning(true);
      setError(null);
      setJob(null);
      void client
        .submitPluginAppAction({
          pluginId: plugin.pluginId,
          appId: appDefinition.id,
          componentId,
          form,
        })
        .then((result) => {
          if (result.error || !result.job) throw new Error(result.error ?? "Action failed");
          setJob(result.job);
          return undefined;
        })
        .catch((nextError: unknown) => {
          setRunning(false);
          setError(nextError instanceof Error ? nextError.message : String(nextError));
          return undefined;
        });
    },
    [appDefinition, client, form, plugin?.pluginId],
  );

  return {
    app,
    prompt,
    setPrompt,
    form,
    job,
    loading,
    generating,
    running,
    error,
    handleGenerate,
    handleFormChange,
    handleRun,
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
  const hasConversation = (app?.conversation.length ?? 0) > 0;
  return (
    <View style={styles.conversationColumn}>
      <Text style={styles.sectionTitle}>Build with Agent</Text>
      <Text style={styles.sectionHint}>
        Describe the interface or request a revision. Agent output is validated against the Paseo
        declarative UI schema; executable HTML and JavaScript are not accepted.
      </Text>
      <View style={styles.conversation}>
        {app?.conversation.slice(-8).map((message) => (
          <View
            key={message.id}
            style={[
              styles.message,
              message.role === "user" ? styles.userMessage : styles.assistantMessage,
            ]}
          >
            <Text style={styles.messageRole}>{message.role === "user" ? "You" : "Agent"}</Text>
            <Text style={styles.bodyText}>{message.content}</Text>
          </View>
        ))}
        {!loading && !hasConversation ? (
          <Text style={styles.sectionHint}>No conversation yet.</Text>
        ) : null}
      </View>
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
        {app?.document ? "Ask Agent to revise" : "Generate interface"}
      </Button>
    </View>
  );
}

function PreviewPane({
  app,
  form,
  job,
  loading,
  running,
  onFormChange,
  onRun,
}: {
  app: PluginAppState | null;
  form: Record<string, unknown>;
  job: PluginHttpJob | null;
  loading: boolean;
  running: boolean;
  onFormChange: (id: string, value: unknown) => void;
  onRun: (componentId: string) => void;
}) {
  return (
    <View style={styles.previewColumn}>
      <Text style={styles.sectionTitle}>Live preview</Text>
      {app?.document?.description ? (
        <Text style={styles.sectionHint}>{app.document.description}</Text>
      ) : null}
      <View style={styles.previewCard}>
        {loading ? <Text style={styles.sectionHint}>Loading…</Text> : null}
        {!loading && !app?.document ? (
          <Text style={styles.sectionHint}>
            Describe the interface on the left, then let Agent generate it.
          </Text>
        ) : null}
        {app?.document?.components.map((component) => (
          <PreviewComponent
            key={component.id}
            component={component}
            form={form}
            job={job}
            busy={running}
            onFormChange={onFormChange}
            onRun={onRun}
          />
        ))}
      </View>
    </View>
  );
}

export function PluginAppModal({
  visible,
  serverId,
  plugin,
  appDefinition,
  onClose,
}: PluginAppModalProps) {
  const controller = usePluginAppController({ visible, serverId, plugin, appDefinition });
  const {
    app,
    prompt,
    setPrompt,
    form,
    job,
    loading,
    generating,
    running,
    error,
    handleGenerate,
    handleFormChange,
    handleRun,
  } = controller;

  const header = useMemo(
    () => ({
      title: app?.document?.title ?? appDefinition?.id ?? "Plugin app",
      subtitle: plugin ? `${plugin.displayName} · Agent-generated interface` : undefined,
    }),
    [app?.document?.title, appDefinition?.id, plugin],
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
      <View style={styles.columns}>
        <ConversationPane
          app={app}
          prompt={prompt}
          loading={loading}
          generating={generating}
          onPromptChange={setPrompt}
          onGenerate={handleGenerate}
        />
        <PreviewPane
          app={app}
          form={form}
          job={job}
          loading={loading}
          running={running}
          onFormChange={handleFormChange}
          onRun={handleRun}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  conversation: {
    ...settingsStyles.card,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
    minHeight: 160,
    maxHeight: 300,
  },
  message: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[1],
  },
  userMessage: {
    backgroundColor: theme.colors.surface3,
  },
  assistantMessage: {
    backgroundColor: theme.colors.surface2,
  },
  messageRole: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
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
  codeText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
