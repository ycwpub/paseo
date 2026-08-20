import { randomUUID } from "node:crypto";
import type pino from "pino";
import {
  DEFAULT_PLUGIN_APP_PROJECT_BINDING,
  PluginAppGenerationSchema,
  type PluginAppDefinition,
  type PluginAppDocument,
  type PluginAppGeneration,
  type PluginAppState,
  type PluginHttpJob,
} from "@getpaseo/protocol/messages";
import type { AgentManager } from "../agent/agent-manager.js";
import { generateStructuredAgentResponseWithFallback } from "../agent/agent-response-loop.js";
import type { ProviderSnapshotManager } from "../agent/provider-snapshot-manager.js";
import {
  resolveStructuredGenerationProviders,
  type StructuredGenerationDaemonConfig,
} from "../agent/structured-generation-providers.js";
import { PluginAppStore } from "./plugin-app-store.js";
import type {
  PluginAppGenerateInput,
  PluginAppRuntime,
  PluginAppSubmitInput,
} from "./plugin-app-runtime-types.js";
import type { PluginHttpServiceRuntime } from "./plugin-http-runtime-types.js";

export interface PluginAppContext {
  definition: PluginAppDefinition;
  pluginRoot: string;
}

export interface PluginHttpTarget {
  pluginId: string;
  serviceName: string;
}

interface GenerateAppInput {
  prompt: string;
  current: PluginAppState;
  context: PluginAppContext;
  httpTargets: PluginHttpTarget[];
}

export interface PluginAppServiceOptions {
  paseoHome: string;
  logger: pino.Logger;
  agentManager: AgentManager;
  providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
  readDaemonConfig: () => StructuredGenerationDaemonConfig;
  httpRuntime: PluginHttpServiceRuntime;
  resolveApp: (pluginId: string, appId: string) => PluginAppContext;
  listHttpTargets: () => PluginHttpTarget[];
  generate?: (input: GenerateAppInput) => Promise<PluginAppGeneration>;
  now?: () => Date;
}

function readObjectPath(value: unknown, pathText: string): unknown {
  let current = value;
  for (const segment of pathText.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveTemplate(value: unknown, form: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((entry) => resolveTemplate(entry, form));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveTemplate(entry, form)]),
    );
  }
  if (typeof value !== "string") return value;
  const exact = /^\{\{\s*form\.([A-Za-z0-9_.-]+)\s*\}\}$/u.exec(value);
  if (exact) return readObjectPath(form, exact[1]!);
  return value.replace(/\{\{\s*form\.([A-Za-z0-9_.-]+)\s*\}\}/gu, (_match, key: string) => {
    const resolved = readObjectPath(form, key);
    if (resolved === undefined || resolved === null) return "";
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

function buildGenerationPrompt(input: GenerateAppInput): string {
  const currentDocument = input.current.document
    ? JSON.stringify(input.current.document, null, 2)
    : "(No interface has been generated yet.)";
  const history = input.current.conversation
    .slice(-12)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");
  const targets =
    input.httpTargets.length > 0
      ? input.httpTargets.map((entry) => `- ${entry.pluginId}/${entry.serviceName}`).join("\n")
      : "- No HTTP services are currently available.";
  return [
    "You are Paseo's plugin interface designer.",
    "Generate or revise a safe declarative UI document. Never output JavaScript, HTML, CSS, shell commands, or executable code.",
    "Supported component types: heading, text, text_input, textarea, number_input, select, checkbox, button, status, result, json.",
    "Buttons may only use an http_service action. The action input can use {{form.fieldId}} templates.",
    "The app is Project-scoped. Paseo injects projectId, projectName, and projectSourceDirectory into the form and every HTTP action input. Do not ask the user to type Project IDs or repository paths already supplied by Project context.",
    "Use stable, unique component IDs. Include status and result components when the UI submits an HTTP processing job.",
    "Only bind actions to one of these installed HTTP services:",
    targets,
    "",
    `Plugin: ${input.current.pluginId}`,
    `App: ${input.current.appId}`,
    `Project: ${input.current.projectId}`,
    `Category: ${input.context.definition.category ?? "Uncategorized"}`,
    "",
    "Current interface:",
    currentDocument,
    "",
    history ? `Recent conversation:\n${history}\n` : "",
    `User request:\n${input.prompt}`,
    "",
    "Return a short assistant message and the complete updated interface document.",
  ]
    .filter(Boolean)
    .join("\n");
}

function findButton(document: PluginAppDocument, componentId: string) {
  const component = document.components.find((entry) => entry.id === componentId);
  if (!component || component.type !== "button") {
    throw new Error(`Plugin app button not found: ${componentId}`);
  }
  return component;
}

function validateRequiredFields(document: PluginAppDocument, form: Record<string, unknown>): void {
  for (const component of document.components) {
    if (
      !(
        component.type === "text_input" ||
        component.type === "textarea" ||
        component.type === "number_input" ||
        component.type === "select" ||
        component.type === "checkbox"
      ) ||
      !component.required
    ) {
      continue;
    }
    const value = form[component.id];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim().length === 0)
    ) {
      throw new Error(`Required field is empty: ${component.label}`);
    }
  }
}

function projectScopedForm(
  input: PluginAppSubmitInput,
  context: PluginAppContext,
): Record<string, unknown> {
  const projectBinding = context.definition.project ?? DEFAULT_PLUGIN_APP_PROJECT_BINDING;
  return {
    ...input.form,
    projectId: input.projectId,
    [projectBinding.idField]: input.projectId,
  };
}

function projectScopedActionInput(
  form: Record<string, unknown>,
  actionInput: unknown,
): Record<string, unknown> {
  const projectContext = {
    projectId: form.projectId,
    ...(form.projectName !== undefined ? { projectName: form.projectName } : {}),
    ...(form.projectSourceDirectory !== undefined
      ? { projectSourceDirectory: form.projectSourceDirectory }
      : {}),
  };
  if (typeof actionInput === "object" && actionInput !== null && !Array.isArray(actionInput)) {
    return {
      ...(actionInput as Record<string, unknown>),
      ...projectContext,
    };
  }
  return {
    ...projectContext,
    data: actionInput,
  };
}

export class PluginAppService implements PluginAppRuntime {
  private readonly store: PluginAppStore;
  private readonly logger: pino.Logger;
  private readonly now: () => Date;
  private readonly generateOverride?: PluginAppServiceOptions["generate"];

  constructor(private readonly options: PluginAppServiceOptions) {
    this.store = new PluginAppStore(`${options.paseoHome}/plugins/data`);
    this.logger = options.logger.child({ module: "plugin-app-service" });
    this.now = options.now ?? (() => new Date());
    this.generateOverride = options.generate;
  }

  get(pluginId: string, appId: string, projectId: string): PluginAppState {
    const context = this.options.resolveApp(pluginId, appId);
    return this.store.get(pluginId, context.definition, projectId, this.now().toISOString());
  }

  async generate(input: PluginAppGenerateInput): Promise<PluginAppState> {
    const context = this.options.resolveApp(input.pluginId, input.appId);
    const current = this.store.get(
      input.pluginId,
      context.definition,
      input.projectId,
      this.now().toISOString(),
    );
    const generated = this.generateOverride
      ? await this.generateOverride({
          prompt: input.prompt,
          current,
          context,
          httpTargets: this.options.listHttpTargets(),
        })
      : await this.generateWithAgent({
          prompt: input.prompt,
          current,
          context,
          httpTargets: this.options.listHttpTargets(),
        });
    const timestamp = this.now().toISOString();
    return this.store.save({
      ...current,
      document: generated.document,
      conversation: [
        ...current.conversation,
        {
          id: randomUUID(),
          role: "user" as const,
          content: input.prompt,
          createdAt: timestamp,
        },
        {
          id: randomUUID(),
          role: "assistant" as const,
          content: generated.message,
          createdAt: timestamp,
        },
      ].slice(-50),
      updatedAt: timestamp,
    });
  }

  async submit(input: PluginAppSubmitInput): Promise<PluginHttpJob> {
    const context = this.options.resolveApp(input.pluginId, input.appId);
    const state = this.get(input.pluginId, input.appId, input.projectId);
    if (!state.document) throw new Error("Generate the plugin app interface before running it");
    const form = projectScopedForm(input, context);
    validateRequiredFields(state.document, form);
    const button = findButton(state.document, input.componentId);
    const targetPluginId = button.action.pluginId ?? input.pluginId;
    const resolvedActionInput =
      button.action.input === undefined ? form : resolveTemplate(button.action.input, form);
    const actionInput = projectScopedActionInput(form, resolvedActionInput);
    return this.options.httpRuntime.submit(targetPluginId, button.action.serviceName, actionInput);
  }

  getJob(processId: string): PluginHttpJob | null {
    return this.options.httpRuntime.getJob(processId);
  }

  listJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
  }): PluginHttpJob[] {
    return this.options.httpRuntime.listJobs(options);
  }

  updateJob(processId: string, input: unknown): Promise<PluginHttpJob | null> {
    return this.options.httpRuntime.updateJob(processId, input);
  }

  deleteJob(processId: string): Promise<boolean> {
    return this.options.httpRuntime.deleteJob(processId);
  }

  private async generateWithAgent(input: GenerateAppInput): Promise<PluginAppGeneration> {
    const providers = await resolveStructuredGenerationProviders({
      cwd: input.context.pluginRoot,
      providerSnapshotManager: this.options.providerSnapshotManager,
      daemonConfig: this.options.readDaemonConfig(),
    });
    if (providers.length === 0) {
      throw new Error("No available provider can generate a plugin interface");
    }
    return generateStructuredAgentResponseWithFallback({
      manager: this.options.agentManager,
      cwd: input.context.pluginRoot,
      prompt: buildGenerationPrompt(input),
      schema: PluginAppGenerationSchema,
      schemaName: "PaseoPluginAppV1",
      maxRetries: 2,
      providers,
      persistSession: false,
      logger: this.logger,
      agentConfigOverrides: {
        title: `Plugin app designer: ${input.current.appId}`,
        internal: true,
      },
    });
  }
}
