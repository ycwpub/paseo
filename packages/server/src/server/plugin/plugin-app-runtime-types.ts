import type { PluginAppState, PluginHttpJob } from "@getpaseo/protocol/messages";

export interface PluginAppGenerateInput {
  pluginId: string;
  appId: string;
  prompt: string;
}

export interface PluginAppSubmitInput {
  pluginId: string;
  appId: string;
  componentId: string;
  form: Record<string, unknown>;
}

export interface PluginAppRuntime {
  get(pluginId: string, appId: string): PluginAppState;
  generate(input: PluginAppGenerateInput): Promise<PluginAppState>;
  submit(input: PluginAppSubmitInput): Promise<PluginHttpJob>;
  getJob(processId: string): PluginHttpJob | null;
  listJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
  }): PluginHttpJob[];
}
