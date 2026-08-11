import type { McpServer, Skill } from "@getpaseo/protocol/messages";
import type {
  AgentPromptInput,
  AgentSessionConfig,
  AgentSlashCommand,
  McpServerConfig,
} from "./agent-sdk-types.js";

const RESERVED_RUNTIME_MCP_SERVER_NAMES = new Set(["paseo"]);

interface SlashInvocation {
  commandName: string;
  args?: string;
}

function canonicalName(name: string): string {
  return name.trim().toLowerCase();
}

function isValidSlashCommandName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !/[\s/]/u.test(trimmed);
}

function toAgentMcpServerConfig(server: McpServer): McpServerConfig {
  switch (server.transport.type) {
    case "stdio":
      return {
        type: "stdio",
        command: server.transport.command,
        ...(server.transport.args ? { args: server.transport.args } : {}),
        ...(server.transport.env ? { env: server.transport.env } : {}),
      };
    case "http":
      return {
        type: "http",
        url: server.transport.url,
        ...(server.transport.headers ? { headers: server.transport.headers } : {}),
      };
    case "sse":
      return {
        type: "sse",
        url: server.transport.url,
        ...(server.transport.headers ? { headers: server.transport.headers } : {}),
      };
  }
}

/**
 * Merge daemon-managed MCP catalog entries into a provider launch config.
 *
 * This mirrors AionUi's "global catalog -> session payload" pattern, but keeps
 * the merge runtime-only: stored agent configs stay clean while every launch /
 * reload sees the current daemon-enabled MCP catalog. Explicit per-agent config
 * wins on name collisions, and the internal "paseo" MCP name is reserved for
 * the daemon's own tool bridge.
 */
export function withSharedMcpServers(
  config: AgentSessionConfig,
  servers: readonly McpServer[],
  selectedServerIds?: readonly string[],
): AgentSessionConfig {
  const existing = config.mcpServers ?? {};
  const occupiedNames = new Set(Object.keys(existing).map(canonicalName));
  const selected = selectedServerIds ? new Set(selectedServerIds) : null;
  let changed = false;
  const merged: Record<string, McpServerConfig> = { ...existing };

  for (const server of servers) {
    if (!server.enabled || (selected && !selected.has(server.id))) continue;
    const name = server.name.trim();
    const canonical = canonicalName(name);
    if (!name || RESERVED_RUNTIME_MCP_SERVER_NAMES.has(canonical) || occupiedNames.has(canonical)) {
      continue;
    }
    merged[name] = toAgentMcpServerConfig(server);
    occupiedNames.add(canonical);
    changed = true;
  }

  return changed ? { ...config, mcpServers: merged } : config;
}

export function listSharedSkillCommands(
  skills: readonly Skill[],
  selectedSkillIds?: readonly string[],
): AgentSlashCommand[] {
  const commandsByName = new Map<string, AgentSlashCommand>();
  const selected = selectedSkillIds ? new Set(selectedSkillIds) : null;
  for (const skill of skills) {
    if (selected && !selected.has(skill.id)) continue;
    const name = skill.name.trim();
    if (!skill.enabled || !isValidSlashCommandName(name) || !skill.content?.trim()) {
      continue;
    }
    const canonical = canonicalName(name);
    if (commandsByName.has(canonical)) {
      continue;
    }
    commandsByName.set(canonical, {
      name,
      description: skill.description?.trim() || "Paseo-managed skill",
      argumentHint: "",
      kind: "skill",
    });
  }
  return Array.from(commandsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeSharedSkillCommands(
  providerCommands: readonly AgentSlashCommand[],
  sharedSkills: readonly Skill[],
  selectedSkillIds?: readonly string[],
): AgentSlashCommand[] {
  const commandsByName = new Map<string, AgentSlashCommand>();
  for (const command of providerCommands) {
    commandsByName.set(canonicalName(command.name), command);
  }
  for (const command of listSharedSkillCommands(sharedSkills, selectedSkillIds)) {
    const canonical = canonicalName(command.name);
    if (!commandsByName.has(canonical)) {
      commandsByName.set(canonical, command);
    }
  }
  return Array.from(commandsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSlashInvocation(prompt: AgentPromptInput): SlashInvocation | null {
  if (typeof prompt !== "string") return null;
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("/") || trimmed.length <= 1) return null;
  const withoutPrefix = trimmed.slice(1);
  const firstWhitespaceIdx = withoutPrefix.search(/\s/u);
  const commandName =
    firstWhitespaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, firstWhitespaceIdx);
  if (!isValidSlashCommandName(commandName)) return null;
  const rawArgs =
    firstWhitespaceIdx === -1 ? "" : withoutPrefix.slice(firstWhitespaceIdx + 1).trim();
  return rawArgs ? { commandName, args: rawArgs } : { commandName };
}

export function resolveSharedSkillInvocation(
  prompt: AgentPromptInput,
  skills: readonly Skill[],
  providerCommands: readonly AgentSlashCommand[] = [],
  selectedSkillIds?: readonly string[],
): AgentPromptInput {
  const invocation = parseSlashInvocation(prompt);
  if (!invocation) return prompt;

  const commandCanonical = canonicalName(invocation.commandName);
  const providerHasCommand = providerCommands.some(
    (command) => canonicalName(command.name) === commandCanonical,
  );
  if (providerHasCommand) {
    return prompt;
  }

  const selected = selectedSkillIds ? new Set(selectedSkillIds) : null;
  const skill = skills.find(
    (entry) =>
      (!selected || selected.has(entry.id)) &&
      entry.enabled &&
      Boolean(entry.content?.trim()) &&
      canonicalName(entry.name) === commandCanonical &&
      isValidSlashCommandName(entry.name),
  );
  if (!skill?.content?.trim()) {
    return prompt;
  }

  const args = invocation.args?.trim();
  return [
    `Use the following Paseo-managed skill: ${skill.name.trim()}.`,
    skill.description?.trim() ? `Description: ${skill.description.trim()}` : "",
    "",
    "<skill_instructions>",
    skill.content.trim(),
    "</skill_instructions>",
    "",
    args ? `<user_arguments>\n${args}\n</user_arguments>` : "No user arguments were provided.",
    "",
    "Follow the skill instructions and apply them to the user's arguments.",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}
