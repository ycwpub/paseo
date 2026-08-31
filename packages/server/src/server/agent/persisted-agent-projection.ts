import type { ManagedAgent } from "./agent-manager.js";
import { toStoredAgentRecord } from "./agent-projections.js";
import type { StoredAgentRecord } from "./agent-storage.js";
import { readProjectDirectoryAgentConfig } from "./project-directory-agent-config.js";

interface PersistedAgentProjectionOptions {
  title?: string | null;
  createdAt?: string;
  internal?: boolean;
}

/**
 * Adds project directory access metadata to the stable upstream agent record.
 * Keeping this enrichment at the storage boundary avoids coupling the generic
 * protocol projection layer to Project-specific execution configuration.
 */
export function toPersistedAgentRecord(
  agent: ManagedAgent,
  options?: PersistedAgentProjectionOptions,
): StoredAgentRecord {
  const record = toStoredAgentRecord(agent, options);
  const { writableProjectDirectories, readOnlyProjectDirectories } =
    readProjectDirectoryAgentConfig(agent.config);

  if (!writableProjectDirectories?.length && !readOnlyProjectDirectories?.length) {
    return record;
  }

  record.config = {
    ...record.config,
    ...(writableProjectDirectories?.length
      ? { writableProjectDirectories: [...writableProjectDirectories] }
      : {}),
    ...(readOnlyProjectDirectories?.length
      ? { readOnlyProjectDirectories: [...readOnlyProjectDirectories] }
      : {}),
  };
  return record;
}
