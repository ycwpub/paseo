import type {
  PluginAppDefaultAgent,
  PluginAppState,
  PluginHttpJob,
} from "@getpaseo/protocol/messages";

export interface PluginAppConfigureInput {
  pluginId: string;
  appId: string;
  projectId: string;
  defaultAgent: PluginAppDefaultAgent;
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
  listProjects(pluginId: string, appId: string): PluginAppState[];
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
