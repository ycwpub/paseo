import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  McpTransportSchema,
  PluginAppDefinitionSchema,
  PluginAppDocumentSchema,
  PluginManifestSchema,
  type McpTransport,
  type PluginAppDefinition,
  type PluginManifest,
  type PluginUnsupportedComponent,
} from "@getpaseo/protocol/messages";

export interface PluginSkillDefinition {
  name: string;
  description?: string;
  content: string;
  path: string;
}

export interface PluginMcpDefinition {
  name: string;
  description?: string;
  transport: McpTransport;
  rawConfig: Record<string, unknown>;
}

export interface PluginHttpServiceDefinition {
  name: string;
  host: string;
  port: number;
  path: string;
  workflowPath: string;
  authTokenEnv?: string;
  maxBodyBytes: number;
  memory?: {
    outputPath: string;
  };
}

export interface LoadedPluginPackage {
  root: string;
  manifest: PluginManifest;
  skills: PluginSkillDefinition[];
  mcpServers: PluginMcpDefinition[];
  httpServices: PluginHttpServiceDefinition[];
  apps: PluginAppDefinition[];
  unsupportedComponents: PluginUnsupportedComponent[];
  warnings: string[];
}

const PLUGIN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PLUGIN_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const DEFAULT_HTTP_BODY_BYTES = 1024 * 1024;
const MAX_HTTP_BODY_BYTES = 10 * 1024 * 1024;
const PluginHttpServiceConfigSchema = z.object({
  host: z.string().trim().min(1).default("127.0.0.1"),
  port: z.number().int().nonnegative().max(65_535),
  path: z.string().trim().min(1),
  workflow: z.string().trim().min(1),
  authTokenEnv: z.string().trim().min(1).optional(),
  maxBodyBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_HTTP_BODY_BYTES)
    .default(DEFAULT_HTTP_BODY_BYTES),
  memory: z
    .object({
      outputPath: z.string().trim().min(1).default("memory"),
    })
    .strict()
    .optional(),
});
const PluginAppConfigSchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
  document: z.string().trim().min(1).optional(),
});

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
    if (entry === null || entry === undefined) continue;
    result[key] = String(entry);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function pathContainsOrEquals(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolvePluginPath(pluginRoot: string, relativePath: string, label: string): string {
  if (!relativePath.startsWith("./")) {
    throw new Error(`${label} must use a ./-prefixed path`);
  }
  const candidate = path.resolve(pluginRoot, relativePath);
  if (!pathContainsOrEquals(pluginRoot, candidate)) {
    throw new Error(`${label} escapes the plugin root`);
  }
  if (!existsSync(candidate)) {
    throw new Error(`${label} does not exist: ${relativePath}`);
  }
  const resolved = realpathSync(candidate);
  if (!pathContainsOrEquals(pluginRoot, resolved)) {
    throw new Error(`${label} resolves outside the plugin root`);
  }
  return resolved;
}

function manifestPaths(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveComponentPaths(
  pluginRoot: string,
  declaredPaths: string[],
  defaultPaths: string[],
  label: string,
): string[] {
  const candidates = [
    ...declaredPaths,
    ...defaultPaths.filter((entry) => existsSync(path.resolve(pluginRoot, entry))),
  ];
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of candidates.entries()) {
    const resolved = resolvePluginPath(pluginRoot, entry, `${label}[${index}]`);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    paths.push(resolved);
  }
  return paths;
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
    fields[line.slice(0, separator).trim()] = stripOuterQuotes(line.slice(separator + 1).trim());
  }
  return {
    name: stringValue(fields.name),
    description: stringValue(fields.description),
  };
}

function readSkill(skillDir: string): PluginSkillDefinition | null {
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!existsSync(skillPath) || !statSync(skillPath).isFile()) return null;
  const content = readFileSync(skillPath, "utf8");
  if (!content.trim()) return null;
  const frontMatter = parseFrontMatter(content);
  return {
    name: frontMatter.name ?? path.basename(skillDir),
    description: frontMatter.description,
    content,
    path: skillPath,
  };
}

function discoverSkills(skillsPath: string): PluginSkillDefinition[] {
  const directSkill = readSkill(skillsPath);
  if (directSkill) return [directSkill];
  if (!statSync(skillsPath).isDirectory()) {
    throw new Error(`Plugin skills path is not a directory: ${skillsPath}`);
  }
  const skills: PluginSkillDefinition[] = [];
  for (const entry of readdirSync(skillsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = readSkill(path.join(skillsPath, entry.name));
    if (skill) skills.push(skill);
  }
  return skills;
}

function extractMcpServerMap(value: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return {};
  const wrapped = value.mcp_servers ?? value.mcpServers;
  const source = isRecord(wrapped) ? wrapped : value;
  const result: Record<string, Record<string, unknown>> = {};
  for (const [name, config] of Object.entries(source)) {
    if (isRecord(config)) result[name] = config;
  }
  return result;
}

function parseMcpTransport(config: Record<string, unknown>): McpTransport {
  const url = stringValue(config.url);
  const type = stringValue(config.type)?.toLowerCase();
  if (url) {
    return McpTransportSchema.parse({
      type: type === "sse" ? "sse" : "http",
      url,
      headers: stringRecord(config.headers),
    });
  }
  const command = stringValue(config.command);
  if (!command) {
    throw new Error("MCP server requires command or url");
  }
  return McpTransportSchema.parse({
    type: "stdio",
    command,
    args: stringArray(config.args),
    env: stringRecord(config.env),
  });
}

function discoverMcpServersFromConfig(value: unknown): PluginMcpDefinition[] {
  return Object.entries(extractMcpServerMap(value)).map(([name, config]) => ({
    name,
    description: stringValue(config.description),
    transport: parseMcpTransport(config),
    rawConfig: config,
  }));
}

function discoverMcpServers(configPath: string): PluginMcpDefinition[] {
  if (!statSync(configPath).isFile()) {
    throw new Error(`Plugin MCP path is not a file: ${configPath}`);
  }
  return discoverMcpServersFromConfig(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
}

function normalizeHttpRoutePath(value: string, label: string): string {
  if (!value.startsWith("/")) {
    throw new Error(`${label} must start with /`);
  }
  if (value.includes("?") || value.includes("#") || value.includes(":")) {
    throw new Error(`${label} cannot contain query strings, fragments, or route parameters`);
  }
  return value === "/" ? value : value.replace(/\/+$/u, "");
}

function extractHttpServiceMap(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const wrapped = value.httpServices ?? value.services;
  return isRecord(wrapped) ? wrapped : value;
}

function discoverHttpServices(
  pluginRoot: string,
  configPath: string,
): PluginHttpServiceDefinition[] {
  if (!statSync(configPath).isFile()) {
    throw new Error(`Plugin HTTP services path is not a file: ${configPath}`);
  }
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  return Object.entries(extractHttpServiceMap(parsed)).map(([name, config]) => {
    const service = PluginHttpServiceConfigSchema.parse(config);
    const workflowPath = resolvePluginPath(
      pluginRoot,
      service.workflow,
      `httpServices.${name}.workflow`,
    );
    if (!statSync(workflowPath).isFile()) {
      throw new Error(`HTTP service workflow is not a file: ${service.workflow}`);
    }
    return {
      name,
      host: service.host,
      port: service.port,
      path: normalizeHttpRoutePath(service.path, `httpServices.${name}.path`),
      workflowPath,
      authTokenEnv: service.authTokenEnv,
      maxBodyBytes: service.maxBodyBytes,
      memory: service.memory,
    };
  });
}

function extractAppMap(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return isRecord(value.apps) ? value.apps : value;
}

function discoverApps(pluginRoot: string, configPath: string): PluginAppDefinition[] {
  if (!statSync(configPath).isFile()) {
    throw new Error(`Plugin apps path is not a file: ${configPath}`);
  }
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  return Object.entries(extractAppMap(parsed)).map(([name, config]) => {
    const app = PluginAppConfigSchema.parse(config);
    if (app.id !== name) {
      throw new Error(`Plugin app key ${name} must match its id ${app.id}`);
    }
    const initialDocument = app.document
      ? PluginAppDocumentSchema.parse(
          JSON.parse(
            readFileSync(
              resolvePluginPath(pluginRoot, app.document, `apps.${name}.document`),
              "utf8",
            ),
          ) as unknown,
        )
      : undefined;
    return PluginAppDefinitionSchema.parse({
      id: app.id,
      category: app.category,
      initialDocument,
    });
  });
}

function uniqueNamedDefinitions<T extends { name: string }>(definitions: T[]): T[] {
  const seen = new Set<string>();
  return definitions.filter((definition) => {
    const name = definition.name.trim().toLowerCase();
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function uniqueAppDefinitions(definitions: PluginAppDefinition[]): PluginAppDefinition[] {
  const seen = new Set<string>();
  return definitions.filter((definition) => {
    const id = definition.id.trim().toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function assertPluginTreeSafe(pluginRoot: string): void {
  const root = realpathSync(pluginRoot);
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const stats = lstatSync(entryPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Plugin packages cannot contain symbolic links: ${entryPath}`);
      }
      if (stats.isDirectory()) visit(entryPath);
    }
  };
  visit(root);
}

export function loadPluginPackage(pluginRootInput: string): LoadedPluginPackage {
  if (!existsSync(pluginRootInput) || !statSync(pluginRootInput).isDirectory()) {
    throw new Error(`Plugin directory does not exist: ${pluginRootInput}`);
  }
  const root = realpathSync(pluginRootInput);
  const manifestPath = path.join(root, ".codex-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing .codex-plugin/plugin.json in ${root}`);
  }
  const manifest = PluginManifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, "utf8")) as unknown,
  );
  if (!PLUGIN_NAME_PATTERN.test(manifest.name)) {
    throw new Error(`Plugin name must be kebab-case: ${manifest.name}`);
  }
  if (!PLUGIN_VERSION_PATTERN.test(manifest.version)) {
    throw new Error(`Plugin version must use semantic versioning: ${manifest.version}`);
  }
  if (!manifest.description.trim()) {
    throw new Error("Plugin description is required");
  }

  const skillPaths = resolveComponentPaths(
    root,
    manifestPaths(manifest.skills),
    ["./skills/"],
    "skills",
  );
  const skills = uniqueNamedDefinitions(skillPaths.flatMap((entry) => discoverSkills(entry)));
  const declaredMcpPaths =
    typeof manifest.mcpServers === "string" || Array.isArray(manifest.mcpServers)
      ? manifestPaths(manifest.mcpServers)
      : [];
  const mcpPaths = resolveComponentPaths(root, declaredMcpPaths, ["./.mcp.json"], "mcpServers");
  const inlineMcpServers = isRecord(manifest.mcpServers)
    ? discoverMcpServersFromConfig(manifest.mcpServers)
    : [];
  const mcpServers = uniqueNamedDefinitions([
    ...inlineMcpServers,
    ...mcpPaths.flatMap((entry) => discoverMcpServers(entry)),
  ]);
  const httpServicePaths = resolveComponentPaths(
    root,
    manifestPaths(manifest.httpServices),
    ["./.http.json"],
    "httpServices",
  );
  const httpServices = uniqueNamedDefinitions(
    httpServicePaths.flatMap((entry) => discoverHttpServices(root, entry)),
  );
  const appPaths = resolveComponentPaths(
    root,
    manifestPaths(manifest.apps),
    ["./.app.json"],
    "apps",
  );
  const apps = uniqueAppDefinitions(appPaths.flatMap((entry) => discoverApps(root, entry)));
  const unsupportedComponents: PluginUnsupportedComponent[] = [];
  if (
    manifest.hooks !== undefined ||
    existsSync(path.join(root, "hooks", "hooks.json")) ||
    existsSync(path.join(root, "hooks.json"))
  ) {
    unsupportedComponents.push("hooks");
  }

  const warnings: string[] = [];
  if (
    skills.length === 0 &&
    mcpServers.length === 0 &&
    httpServices.length === 0 &&
    apps.length === 0
  ) {
    warnings.push(
      "The plugin does not contain any supported Skills, MCP servers, HTTP services, or apps.",
    );
  }

  return {
    root,
    manifest,
    skills,
    mcpServers,
    httpServices,
    apps,
    unsupportedComponents,
    warnings,
  };
}
