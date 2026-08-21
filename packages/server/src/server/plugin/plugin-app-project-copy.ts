import { PluginAppStateSchema, type PluginAppState } from "@getpaseo/protocol/messages";

export function buildCopiedPluginAppState(input: {
  source: PluginAppState;
  targetProjectId: string;
  timestamp: string;
}): PluginAppState {
  const { htmlPath: _sourceHtmlPath, ...source } = input.source;
  return PluginAppStateSchema.parse({
    ...source,
    projectId: input.targetProjectId,
    conversation: [],
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  });
}
