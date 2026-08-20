import type {
  PluginHttpJobStatus,
  PluginHttpJob,
  PluginHttpListenerRuntime,
  PluginHttpProjectConfig,
  PluginHttpServiceRuntimeStatus,
  PluginHttpServiceSummary,
} from "@getpaseo/protocol/messages";
import type { PluginHttpServiceDefinition } from "./plugin-package.js";

export interface PluginHttpServiceBinding {
  pluginId: string;
  pluginName: string;
  definition: PluginHttpServiceDefinition;
}

export interface PluginHttpServiceRuntime {
  reconcile(bindings: PluginHttpServiceBinding[]): Promise<void>;
  getStatus(pluginId: string, serviceName: string): PluginHttpServiceSummary | null;
  submit(pluginId: string, serviceName: string, input: unknown): Promise<PluginHttpJob>;
  getJob(processId: string): PluginHttpJob | null;
  listJobs(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
    statuses?: PluginHttpJobStatus[];
    listenerId?: string;
    routeId?: string;
    createdBefore?: string;
    createdAfter?: string;
  }): PluginHttpJob[];
  updateJob(processId: string, input: unknown): Promise<PluginHttpJob | null>;
  deleteJob(processId: string): Promise<boolean>;
  deleteJobs(processIds: string[]): Promise<{
    deleted: string[];
    skipped: Array<{ processId: string; reason: string }>;
  }>;
  getProjectConfig(
    pluginId: string,
    projectId: string,
  ): {
    config: PluginHttpProjectConfig;
    runtimes: PluginHttpListenerRuntime[];
  };
  saveProjectConfig(config: Omit<PluginHttpProjectConfig, "updatedAt">): Promise<{
    config: PluginHttpProjectConfig;
    runtimes: PluginHttpListenerRuntime[];
  }>;
  cleanupProjectJobs(pluginId: string, projectId: string): Promise<string[]>;
  stop(): Promise<void>;
}

export interface PluginWorkflowMemoryWriter {
  write(input: {
    pluginId: string;
    serviceName: string;
    outputPath: string;
    result: unknown;
  }): Promise<void>;
}

export interface MutablePluginHttpServiceStatus {
  status: PluginHttpServiceRuntimeStatus;
  boundPort: number | null;
  submitUrl: string | null;
  resultUrlTemplate: string | null;
  error: string | null;
}
