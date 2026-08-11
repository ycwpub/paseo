import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  type Dirent,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type pino from "pino";
import type { McpServerCreateInput, McpTransport } from "@getpaseo/protocol/messages";
import type { McpStore } from "./mcp/mcp-store.js";
import type { SkillStore } from "./skill/skill-store.js";

export interface SharedResourceImportResult {
  skillsImported: number;
  mcpServersImported: number;
}

export interface SharedResourceImporterOptions {
  paseoHome: string;
  mcpStore: McpStore;
  skillStore: SkillStore;
  logger: pino.Logger;
  homeDir?: string;
  codexHome?: string;
}

interface ProviderImportSource {
  provider: "agents" | "codex" | "claude" | "trae";
  skillDirs: string[];
  mcpConfigFiles: Array<{ path: string; format: "json" | "toml" | "yaml" }>;
}

interface DiscoveredSkill {
  name: string;
  description?: string;
  content: string;
  path: string;
  provider: ProviderImportSource["provider"];
}

interface DiscoveredMcpServer {
  name: string;
  description?: string;
  transport: McpTransport;
  rawConfig: Record<string, unknown>;
  provider: ProviderImportSource["provider"];
  sourcePath: string;
}

const RESERVED_MCP_SERVER_NAMES = new Set(["paseo"]);

function canonicalName(name: string): string {
  return name.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => String(entry));
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    result[key] = String(entry);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function pathContainsOrEquals(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed) as string;
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(content: string): { name?: string; description?: string } {
  const normalized = content.replace(/^\uFEFF/u, "");
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u.exec(normalized);
  if (!match) return {};
  const fields: Record<string, string> = {};
  for (const rawLine of match[1]!.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = stripOuterQuotes(line.slice(separator + 1).trim());
    fields[key] = value;
  }
  return {
    name: stringValue(fields.name),
    description: stringValue(fields.description),
  };
}

function discoverSkillsFromDir(input: {
  dir: string;
  provider: ProviderImportSource["provider"];
  paseoHome: string;
  logger: pino.Logger;
}): DiscoveredSkill[] {
  if (!existsSync(input.dir)) return [];
  const materializedRootPath = path.join(input.paseoHome, "skills-materialized");
  const materializedRoot = existsSync(materializedRootPath)
    ? realpathSync(materializedRootPath)
    : materializedRootPath;
  const result: DiscoveredSkill[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(input.dir, { withFileTypes: true });
  } catch (error) {
    input.logger.warn({ err: error, dir: input.dir }, "Failed to scan provider skill directory");
    return result;
  }

  for (const entry of entries) {
    const entryPath = path.join(input.dir, entry.name);
    try {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const entryStats = lstatSync(entryPath);
      if (entryStats.isSymbolicLink()) {
        const targetPath = realpathSync(entryPath);
        if (pathContainsOrEquals(materializedRoot, targetPath)) {
          continue;
        }
      }
      const resolvedEntryPath = realpathSync(entryPath);
      if (pathContainsOrEquals(materializedRoot, resolvedEntryPath)) {
        continue;
      }
      const skillPath = path.join(entryPath, "SKILL.md");
      if (!existsSync(skillPath) || !statSync(skillPath).isFile()) continue;
      const content = readFileSync(skillPath, "utf8");
      if (!content.trim()) continue;
      const frontMatter = parseFrontMatter(content);
      result.push({
        name: frontMatter.name ?? entry.name,
        description: frontMatter.description,
        content,
        path: skillPath,
        provider: input.provider,
      });
    } catch (error) {
      input.logger.warn({ err: error, path: entryPath }, "Failed to import provider skill");
    }
  }
  return result;
}

function stripTomlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === "#" && quote === null) {
      return line.slice(0, i);
    }
  }
  return line;
}

function splitTopLevel(value: string, delimiter = ","): string[] {
  const parts: string[] = [];
  let quote: '"' | "'" | null = null;
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (quote === null) {
      if (char === "[" || char === "{") depth += 1;
      if (char === "]" || char === "}") depth -= 1;
      if (char === delimiter && depth === 0) {
        parts.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseLooseScalar(rawValue: string): unknown {
  const value = rawValue.trim();
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitTopLevel(inner).map(parseLooseScalar) : [];
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1).trim();
    const result: Record<string, unknown> = {};
    for (const part of inner ? splitTopLevel(inner) : []) {
      const eq = part.indexOf("=") >= 0 ? part.indexOf("=") : part.indexOf(":");
      if (eq <= 0) continue;
      const key = stripOuterQuotes(part.slice(0, eq).trim());
      result[key] = parseLooseScalar(part.slice(eq + 1).trim());
    }
    return result;
  }
  return value;
}

function parseTomlMcpServers(content: string): Record<string, Record<string, unknown>> {
  const servers: Record<string, Record<string, unknown>> = {};
  let current: { name: string; path: string[] } | null = null;
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const section = /^\[([^\]]+)\]$/u.exec(line);
    if (section) {
      const parts = section[1]!.split(".").map(stripOuterQuotes);
      const root = parts[0];
      if ((root === "mcp_servers" || root === "mcpServers") && parts[1]) {
        current = { name: parts[1], path: parts.slice(2) };
        servers[current.name] ??= {};
      } else {
        current = null;
      }
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = stripOuterQuotes(line.slice(0, eq).trim());
    const value = parseLooseScalar(line.slice(eq + 1).trim());
    let target = servers[current.name]!;
    for (const part of current.path) {
      const existing = target[part];
      if (!isRecord(existing)) {
        target[part] = {};
      }
      target = target[part] as Record<string, unknown>;
    }
    target[key] = value;
  }
  return servers;
}

function parseJsonMcpServers(content: string): Record<string, Record<string, unknown>> {
  const parsed = JSON.parse(content) as unknown;
  return extractMcpServersFromObject(parsed);
}

function countLeadingSpaces(value: string): number {
  const match = /^\s*/u.exec(value);
  return match?.[0].length ?? 0;
}

function parseYamlBlock(lines: string[], startIndex: number, indent: number): [unknown, number] {
  const result: Record<string, unknown> = {};
  const list: unknown[] = [];
  let isList = false;
  let index = startIndex;
  while (index < lines.length) {
    const rawLine = lines[index]!;
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) {
      index += 1;
      continue;
    }
    const lineIndent = countLeadingSpaces(rawLine);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      index += 1;
      continue;
    }
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("- ")) {
      isList = true;
      list.push(parseLooseScalar(trimmed.slice(2)));
      index += 1;
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      index += 1;
      continue;
    }
    const key = stripOuterQuotes(trimmed.slice(0, separator).trim());
    const rawValue = trimmed.slice(separator + 1).trim();
    if (rawValue) {
      result[key] = parseLooseScalar(rawValue);
      index += 1;
      continue;
    }
    const [nested, nextIndex] = parseYamlBlock(lines, index + 1, indent + 2);
    result[key] = nested;
    index = nextIndex;
  }
  return [isList ? list : result, index];
}

function parseYamlMcpServers(content: string): Record<string, Record<string, unknown>> {
  const [parsed] = parseYamlBlock(content.split(/\r?\n/u), 0, 0);
  return extractMcpServersFromObject(parsed);
}

function extractMcpServersFromObject(value: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return {};
  const rawServers = value.mcpServers ?? value.mcp_servers;
  if (!isRecord(rawServers)) return {};
  const servers: Record<string, Record<string, unknown>> = {};
  for (const [name, config] of Object.entries(rawServers)) {
    if (isRecord(config)) servers[name] = config;
  }
  return servers;
}

function normalizeMcpServer(input: {
  name: string;
  rawConfig: Record<string, unknown>;
  provider: ProviderImportSource["provider"];
  sourcePath: string;
}): DiscoveredMcpServer | null {
  const name = input.name.trim();
  if (!name || RESERVED_MCP_SERVER_NAMES.has(canonicalName(name))) return null;
  const transportRecord = isRecord(input.rawConfig.transport) ? input.rawConfig.transport : {};
  const type = stringValue(input.rawConfig.type) ?? stringValue(transportRecord.type);
  const command = stringValue(input.rawConfig.command) ?? stringValue(transportRecord.command);
  const url = stringValue(input.rawConfig.url) ?? stringValue(transportRecord.url);
  const args = stringArray(input.rawConfig.args) ?? stringArray(transportRecord.args);
  const env = stringRecord(input.rawConfig.env) ?? stringRecord(transportRecord.env);
  const headers = stringRecord(input.rawConfig.headers) ?? stringRecord(transportRecord.headers);
  const description = stringValue(input.rawConfig.description);

  if (command) {
    return {
      name,
      description,
      provider: input.provider,
      sourcePath: input.sourcePath,
      rawConfig: input.rawConfig,
      transport: {
        type: "stdio",
        command,
        ...(args ? { args } : {}),
        ...(env ? { env } : {}),
      },
    };
  }
  if (!url) return null;
  const normalizedType = type === "sse" || /\/sse(?:\?|$)/u.test(url) ? "sse" : "http";
  return {
    name,
    description,
    provider: input.provider,
    sourcePath: input.sourcePath,
    rawConfig: input.rawConfig,
    transport: {
      type: normalizedType,
      url,
      ...(headers ? { headers } : {}),
    },
  };
}

function discoverMcpServersFromFile(input: {
  configFile: ProviderImportSource["mcpConfigFiles"][number];
  provider: ProviderImportSource["provider"];
  logger: pino.Logger;
}): DiscoveredMcpServer[] {
  if (!existsSync(input.configFile.path)) return [];
  try {
    const content = readFileSync(input.configFile.path, "utf8");
    let rawServers: Record<string, Record<string, unknown>>;
    if (input.configFile.format === "json") {
      rawServers = parseJsonMcpServers(content);
    } else if (input.configFile.format === "toml") {
      rawServers = parseTomlMcpServers(content);
    } else {
      rawServers = parseYamlMcpServers(content);
    }
    return Object.entries(rawServers)
      .map(([name, rawConfig]) =>
        normalizeMcpServer({
          name,
          rawConfig,
          provider: input.provider,
          sourcePath: input.configFile.path,
        }),
      )
      .filter((server): server is DiscoveredMcpServer => server !== null);
  } catch (error) {
    input.logger.warn(
      { err: error, path: input.configFile.path, provider: input.provider },
      "Failed to import provider MCP config",
    );
    return [];
  }
}

function createProviderSources(homeDir: string, codexHome: string): ProviderImportSource[] {
  return [
    {
      provider: "agents",
      skillDirs: [path.join(homeDir, ".agents", "skills")],
      mcpConfigFiles: [],
    },
    {
      provider: "codex",
      skillDirs: [path.join(codexHome, "skills")],
      mcpConfigFiles: [{ path: path.join(codexHome, "config.toml"), format: "toml" }],
    },
    {
      provider: "claude",
      skillDirs: [path.join(homeDir, ".claude", "skills")],
      mcpConfigFiles: [
        { path: path.join(homeDir, ".claude", "settings.json"), format: "json" },
        {
          path: path.join(
            homeDir,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
          ),
          format: "json",
        },
      ],
    },
    {
      provider: "trae",
      skillDirs: [path.join(homeDir, ".trae", "skills")],
      mcpConfigFiles: [
        { path: path.join(homeDir, ".trae", "traecli.toml"), format: "toml" },
        { path: path.join(homeDir, ".trae", "traecli.yaml"), format: "yaml" },
        { path: path.join(homeDir, ".trae", "traecli.yml"), format: "yaml" },
      ],
    },
  ];
}

function toMcpCreateInput(server: DiscoveredMcpServer): McpServerCreateInput {
  return {
    name: server.name,
    description: server.description ?? `Imported from ${server.provider}`,
    enabled: true,
    transport: server.transport,
    originalJson: JSON.stringify(
      {
        __paseoImported: true,
        provider: server.provider,
        sourcePath: server.sourcePath,
        mcpServers: { [server.name]: server.rawConfig },
      },
      null,
      2,
    ),
  };
}

export function importProviderResourcesOnStartup(
  options: SharedResourceImporterOptions,
): SharedResourceImportResult {
  const homeDir = options.homeDir ?? os.homedir();
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? path.join(homeDir, ".codex");
  const logger = options.logger.child({ module: "shared-resource-importer" });
  const sources = createProviderSources(homeDir, codexHome);
  const seenSkillNames = new Set<string>();
  const seenMcpNames = new Set<string>();
  let skillsImported = 0;
  let mcpServersImported = 0;

  for (const source of sources) {
    for (const skillDir of source.skillDirs) {
      for (const skill of discoverSkillsFromDir({
        dir: skillDir,
        provider: source.provider,
        paseoHome: options.paseoHome,
        logger,
      })) {
        const canonical = canonicalName(skill.name);
        if (seenSkillNames.has(canonical)) continue;
        seenSkillNames.add(canonical);
        options.skillStore.upsertImported({
          name: skill.name,
          description: skill.description,
          content: skill.content,
          path: skill.path,
          source: "builtin",
          enabled: true,
          tags: ["imported", skill.provider],
        });
        skillsImported += 1;
      }
    }

    for (const configFile of source.mcpConfigFiles) {
      for (const server of discoverMcpServersFromFile({
        configFile,
        provider: source.provider,
        logger,
      })) {
        const canonical = canonicalName(server.name);
        if (seenMcpNames.has(canonical)) continue;
        seenMcpNames.add(canonical);
        options.mcpStore.upsertImported(toMcpCreateInput(server));
        mcpServersImported += 1;
      }
    }
  }

  if (skillsImported > 0 || mcpServersImported > 0) {
    logger.info({ skillsImported, mcpServersImported }, "Imported provider MCP servers and skills");
  }
  return { skillsImported, mcpServersImported };
}
