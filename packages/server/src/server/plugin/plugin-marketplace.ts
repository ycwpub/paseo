import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export interface PluginMarketplaceEntry {
  name: string;
  category?: string;
  sourceType: "local" | "git" | "npm" | "unknown";
  sourcePath?: string;
  installable: boolean;
  warning?: string;
}

export interface LoadedPluginMarketplace {
  id: string;
  name: string;
  displayName: string;
  filePath: string;
  root: string;
  plugins: PluginMarketplaceEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathContainsOrEquals(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function marketplaceRoot(filePath: string): string {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.endsWith("/.agents/plugins/marketplace.json")) {
    return path.dirname(path.dirname(path.dirname(filePath)));
  }
  if (normalized.endsWith("/.claude-plugin/marketplace.json")) {
    return path.dirname(path.dirname(filePath));
  }
  return path.dirname(filePath);
}

function resolveMarketplaceFile(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (!existsSync(resolved)) {
    throw new Error(`Marketplace path does not exist: ${resolved}`);
  }
  if (statSync(resolved).isFile()) return realpathSync(resolved);
  const candidates = [
    path.join(resolved, ".agents", "plugins", "marketplace.json"),
    path.join(resolved, ".claude-plugin", "marketplace.json"),
    path.join(resolved, "marketplace.json"),
  ];
  const match = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  if (!match) {
    throw new Error(`No marketplace.json found under ${resolved}`);
  }
  return realpathSync(match);
}

function stableMarketplaceId(filePath: string): string {
  return `marketplace-${createHash("sha256").update(filePath).digest("hex").slice(0, 16)}`;
}

function parseLocalEntry(
  name: string,
  category: string | undefined,
  relativePath: string,
  root: string,
  warningPrefix: string,
  blockedByPolicy: boolean,
): PluginMarketplaceEntry {
  if (!relativePath.startsWith("./")) {
    return {
      name,
      category,
      sourceType: "local",
      installable: false,
      warning: `${warningPrefix} must start with ./`,
    };
  }
  const sourcePath = path.resolve(root, relativePath);
  if (!pathContainsOrEquals(root, sourcePath)) {
    return {
      name,
      category,
      sourceType: "local",
      installable: false,
      warning: `${warningPrefix} escapes the marketplace root`,
    };
  }
  return {
    name,
    category,
    sourceType: "local",
    sourcePath,
    installable: !blockedByPolicy,
    ...(blockedByPolicy ? { warning: "Marketplace policy marks this plugin unavailable." } : {}),
  };
}

function parseObjectSource(
  source: Record<string, unknown>,
  name: string,
  category: string | undefined,
  root: string,
  index: number,
  blockedByPolicy: boolean,
): PluginMarketplaceEntry {
  const sourceType = typeof source.source === "string" ? source.source : "unknown";
  if (sourceType === "local") {
    const relativePath = typeof source.path === "string" ? source.path : "";
    return parseLocalEntry(
      name,
      category,
      relativePath,
      root,
      `plugins[${index}].source.path`,
      blockedByPolicy,
    );
  }
  if (sourceType === "url" || sourceType === "git-subdir") {
    return {
      name,
      category,
      sourceType: "git",
      installable: false,
      warning: "Git-backed marketplace plugins are not supported yet.",
    };
  }
  if (sourceType === "npm") {
    return {
      name,
      category,
      sourceType: "npm",
      installable: false,
      warning: "npm marketplace plugins are not supported yet.",
    };
  }
  return {
    name,
    category,
    sourceType: "unknown",
    installable: false,
    warning: `Unsupported marketplace source: ${sourceType}`,
  };
}

function parsePluginEntry(
  value: unknown,
  root: string,
  index: number,
): PluginMarketplaceEntry | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return null;
  const category = typeof value.category === "string" ? value.category : undefined;
  const policy = isRecord(value.policy) ? value.policy : {};
  const installation =
    typeof policy.installation === "string" ? policy.installation.toUpperCase() : "AVAILABLE";
  const blockedByPolicy = installation === "NOT_AVAILABLE";
  const source = value.source;
  if (typeof source === "string") {
    return parseLocalEntry(
      name,
      category,
      source,
      root,
      `plugins[${index}].source`,
      blockedByPolicy,
    );
  }
  if (!isRecord(source)) {
    return {
      name,
      category,
      sourceType: "unknown",
      installable: false,
      warning: `plugins[${index}] has no supported source`,
    };
  }
  return parseObjectSource(source, name, category, root, index, blockedByPolicy);
}

export function loadPluginMarketplace(inputPath: string): LoadedPluginMarketplace {
  const filePath = resolveMarketplaceFile(inputPath);
  const root = marketplaceRoot(filePath);
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Marketplace must contain a JSON object: ${filePath}`);
  }
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!name) throw new Error(`Marketplace name is required: ${filePath}`);
  const interfaceValue = isRecord(parsed.interface) ? parsed.interface : {};
  const displayName =
    typeof interfaceValue.displayName === "string" && interfaceValue.displayName.trim()
      ? interfaceValue.displayName.trim()
      : name;
  const pluginValues = Array.isArray(parsed.plugins) ? parsed.plugins : [];
  return {
    id: stableMarketplaceId(filePath),
    name,
    displayName,
    filePath,
    root,
    plugins: pluginValues
      .map((entry, index) => parsePluginEntry(entry, root, index))
      .filter((entry): entry is PluginMarketplaceEntry => entry !== null),
  };
}
