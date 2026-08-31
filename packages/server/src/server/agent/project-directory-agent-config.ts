import type { AgentSessionConfig } from "./agent-sdk-types.js";

export interface ProjectDirectoryAgentConfig {
  writableProjectDirectories?: string[];
  readOnlyProjectDirectories?: string[];
}

export type ProjectAwareAgentSessionConfig = AgentSessionConfig & ProjectDirectoryAgentConfig;

export type ProjectAwareAgentSessionConfigOverrides = Partial<AgentSessionConfig> &
  ProjectDirectoryAgentConfig;

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

export function readProjectDirectoryAgentConfig(
  config: AgentSessionConfig | Partial<AgentSessionConfig> | Record<string, unknown>,
): ProjectDirectoryAgentConfig {
  const record = config as Record<string, unknown>;
  return {
    writableProjectDirectories: readStringArray(record.writableProjectDirectories),
    readOnlyProjectDirectories: readStringArray(record.readOnlyProjectDirectories),
  };
}

export function toProjectAwareAgentSessionConfig(
  config: AgentSessionConfig,
): ProjectAwareAgentSessionConfig {
  return {
    ...config,
    ...readProjectDirectoryAgentConfig(config),
  };
}
