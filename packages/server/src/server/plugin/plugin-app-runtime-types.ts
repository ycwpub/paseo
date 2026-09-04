import type {
  PluginAppDefaultAgent,
  PluginAppState,
  PluginHttpJob,
} from "@getpaseo/protocol/messages";
import type { PluginProjectUpdate } from "./plugin-project-binding-store.js";

export interface PluginAppConfigureInput {
  pluginId: string;
  appId: string;
  projectId: string;
  defaultAgent: PluginAppDefaultAgent;
  data?: Record<string, unknown>;
}

export interface PluginAppProjectCopyInput {
  pluginId: string;
  appId: string;
  sourceProjectId: string;
  targetProjectId: string;
}

export interface PluginAppGenerateInput {
  pluginId: string;
  appId: string;
  projectId: string;
  prompt: string;
}

export interface PluginAppSubmitInput {
  pluginId: string;
  appId: string;
  projectId: string;
  componentId: string;
  form: Record<string, unknown>;
}

export interface PluginAppRuntime {
  get(pluginId: string, appId: string, projectId: string): PluginAppState;
  configure(input: PluginAppConfigureInput): PluginAppState;
  updateProject(
    pluginId: string,
    appId: string,
    projectId: string,
    update: PluginProjectUpdate,
  ): PluginAppState;
  listProjects(pluginId: string, appId: string): PluginAppState[];
  getHtmlPreview(
    pluginId: string,
    appId: string,
    projectId: string,
  ): { html: string; htmlPath: string } | null;
  copyProject(input: PluginAppProjectCopyInput): PluginAppState;
  deleteProject(pluginId: string, appId: string, projectId: string): boolean;
  generate(input: PluginAppGenerateInput): Promise<PluginAppState>;
  submit(input: PluginAppSubmitInput): Promise<PluginHttpJob>;
  getJob(processId: string): PluginHttpJob | null;
  listJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
  }): PluginHttpJob[];
  updateJob(processId: string, input: unknown): Promise<PluginHttpJob | null>;
  deleteJob(processId: string): Promise<boolean>;
}
