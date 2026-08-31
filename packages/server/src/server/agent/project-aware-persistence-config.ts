import { stripInternalPaseoMcpServer } from "./runtime-mcp-config.js";
import type { AgentProvider } from "./agent-sdk-types.js";
import type { StoredAgentRecord } from "./agent-storage.js";
import { inferWritableProjectDirectoriesFromSystemPrompt } from "./project-directory-access.js";
import { inferReadOnlyProjectDirectoriesFromSystemPrompt } from "./project-reference-directory-access.js";
import {
  toProjectAwareAgentSessionConfig,
  type ProjectAwareAgentSessionConfig,
  type ProjectAwareAgentSessionConfigOverrides,
} from "./project-directory-agent-config.js";

interface BuildProjectAwareSessionConfigOptions {
  validProviders?: Iterable<AgentProvider>;
}

function isProviderRegistered(
  validProviders: Iterable<AgentProvider> | undefined,
  provider: AgentProvider,
): boolean {
  if (!validProviders) return true;
  if (validProviders instanceof Set) return validProviders.has(provider);
  return new Set(validProviders).has(provider);
}

function resolveStoredWritableProjectDirectories(record: StoredAgentRecord): string[] {
  return (
    record.config?.writableProjectDirectories ??
    inferWritableProjectDirectoriesFromSystemPrompt(record.config?.systemPrompt)
  );
}

function resolveStoredReadOnlyProjectDirectories(record: StoredAgentRecord): string[] {
  return (
    record.config?.readOnlyProjectDirectories ??
    inferReadOnlyProjectDirectoriesFromSystemPrompt(record.config?.systemPrompt)
  );
}

export function buildProjectAwareConfigOverrides(
  record: StoredAgentRecord,
): ProjectAwareAgentSessionConfigOverrides {
  const writableProjectDirectories = resolveStoredWritableProjectDirectories(record);
  const readOnlyProjectDirectories = resolveStoredReadOnlyProjectDirectories(record);
  const config: ProjectAwareAgentSessionConfig = {
    provider: record.provider,
    cwd: record.cwd,
    modeId: record.config?.modeId ?? undefined,
    model: record.config?.model ?? undefined,
    thinkingOptionId: record.config?.thinkingOptionId ?? undefined,
    featureValues: record.config?.featureValues ?? undefined,
    writableProjectDirectories:
      writableProjectDirectories.length > 0 ? writableProjectDirectories : undefined,
    readOnlyProjectDirectories:
      readOnlyProjectDirectories.length > 0 ? readOnlyProjectDirectories : undefined,
    providerOptions: record.config?.providerOptions ?? undefined,
    toolPolicy: record.config?.toolPolicy ?? undefined,
    systemPrompt: record.config?.systemPrompt ?? undefined,
    mcpServers: record.config?.mcpServers ?? undefined,
  };
  return toProjectAwareAgentSessionConfig(stripInternalPaseoMcpServer(config));
}

export function buildProjectAwareSessionConfig(
  record: StoredAgentRecord,
  options?: BuildProjectAwareSessionConfigOptions,
): ProjectAwareAgentSessionConfig | null {
  if (!isProviderRegistered(options?.validProviders, record.provider)) return null;

  const overrides = buildProjectAwareConfigOverrides(record);
  return toProjectAwareAgentSessionConfig(
    stripInternalPaseoMcpServer({
      provider: record.provider,
      cwd: record.cwd,
      modeId: overrides.modeId,
      model: overrides.model,
      thinkingOptionId: overrides.thinkingOptionId,
      featureValues: overrides.featureValues,
      writableProjectDirectories: overrides.writableProjectDirectories,
      readOnlyProjectDirectories: overrides.readOnlyProjectDirectories,
      providerOptions: overrides.providerOptions,
      toolPolicy: overrides.toolPolicy,
      systemPrompt: overrides.systemPrompt,
      mcpServers: overrides.mcpServers,
    } as ProjectAwareAgentSessionConfig),
  );
}
