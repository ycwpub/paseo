import {
  PluginHttpProjectConfigSchema,
  type PluginHttpProjectConfig,
} from "@getpaseo/protocol/messages";

export function buildCopiedPluginHttpProjectConfig(input: {
  source: PluginHttpProjectConfig;
  targetProjectId: string;
  timestamp: string;
}): PluginHttpProjectConfig {
  return PluginHttpProjectConfigSchema.parse({
    ...input.source,
    projectId: input.targetProjectId,
    listeners: input.source.listeners.map((listener) => ({
      ...listener,
      enabled: false,
    })),
    updatedAt: input.timestamp,
  });
}
