import type {
  PluginHttpJob,
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
