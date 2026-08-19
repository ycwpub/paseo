import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  PluginHttpProjectConfigSchema,
  type PluginHttpProjectConfig,
} from "@getpaseo/protocol/messages";
import {
  ensurePrivateDirectory,
  ensurePrivateFile,
  writePrivateFileAtomicSync,
} from "../private-files.js";

function configKey(pluginId: string, projectId: string): string {
  return `${pluginId}\u0000${projectId}`;
}

function configFileName(pluginId: string, projectId: string): string {
  return `${createHash("sha256").update(configKey(pluginId, projectId)).digest("hex")}.json`;
}

export class PluginHttpConfigStore {
  private readonly configs = new Map<string, PluginHttpProjectConfig>();

  constructor(private readonly directory: string) {}

  initialize(): void {
    ensurePrivateDirectory(this.directory);
    for (const entry of readdirSync(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(this.directory, entry.name);
      try {
        ensurePrivateFile(filePath);
        const config = PluginHttpProjectConfigSchema.parse(
          JSON.parse(readFileSync(filePath, "utf8")) as unknown,
        );
        this.configs.set(configKey(config.pluginId, config.projectId), config);
      } catch {
        // Invalid configuration files are ignored and can be replaced from the UI.
      }
    }
  }

  get(pluginId: string, projectId: string): PluginHttpProjectConfig | null {
    return this.configs.get(configKey(pluginId, projectId)) ?? null;
  }

  list(): PluginHttpProjectConfig[] {
    return [...this.configs.values()];
  }

  save(config: PluginHttpProjectConfig): PluginHttpProjectConfig {
    const parsed = PluginHttpProjectConfigSchema.parse(config);
    ensurePrivateDirectory(this.directory);
    const filePath = path.join(this.directory, configFileName(parsed.pluginId, parsed.projectId));
    writePrivateFileAtomicSync(filePath, JSON.stringify(parsed, null, 2));
    this.configs.set(configKey(parsed.pluginId, parsed.projectId), parsed);
    return parsed;
  }
}
