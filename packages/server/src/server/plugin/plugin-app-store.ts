import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  PluginAppStateSchema,
  type PluginAppDefinition,
  type PluginAppState,
} from "@getpaseo/protocol/messages";
import {
  ensurePrivateDirectory,
  ensurePrivateFile,
  writePrivateFileAtomicSync,
} from "../private-files.js";

function safeSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
}

export class PluginAppStore {
  constructor(private readonly root: string) {}

  get(
    pluginId: string,
    definition: PluginAppDefinition,
    projectId: string,
    now = new Date().toISOString(),
  ): PluginAppState {
    const filePath = this.filePath(pluginId, definition.id, projectId);
    if (!existsSync(filePath)) {
      return PluginAppStateSchema.parse({
        pluginId,
        appId: definition.id,
        projectId,
        defaultAgent: null,
        category: definition.category,
        document: definition.initialDocument ?? null,
        conversation: [],
        createdAt: now,
        updatedAt: now,
      });
    }
    ensurePrivateFile(filePath);
    const state = PluginAppStateSchema.parse(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
    if (
      state.pluginId !== pluginId ||
      state.appId !== definition.id ||
      state.projectId !== projectId
    ) {
      throw new Error(
        `Stored plugin app identity does not match ${pluginId}/${definition.id}/${projectId}`,
      );
    }
    return state;
  }

  save(state: PluginAppState): PluginAppState {
    const parsed = PluginAppStateSchema.parse(state);
    if (!parsed.projectId) {
      throw new Error("Project-scoped plugin app state requires projectId");
    }
    const filePath = this.filePath(parsed.pluginId, parsed.appId, parsed.projectId);
    ensurePrivateDirectory(path.dirname(filePath));
    writePrivateFileAtomicSync(filePath, JSON.stringify(parsed, null, 2));
    return parsed;
  }

  list(pluginId: string, definition: PluginAppDefinition): PluginAppState[] {
    const projectsRoot = this.projectsRoot(pluginId, definition.id);
    if (!existsSync(projectsRoot)) return [];
    const states: PluginAppState[] = [];
    for (const entry of readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join(projectsRoot, entry.name, "state.json");
      if (!existsSync(filePath)) continue;
      try {
        ensurePrivateFile(filePath);
        const state = PluginAppStateSchema.parse(
          JSON.parse(readFileSync(filePath, "utf8")) as unknown,
        );
        if (state.pluginId === pluginId && state.appId === definition.id && state.projectId) {
          states.push(state);
        }
      } catch {
        // Ignore corrupt or stale entries so one project does not hide the rest.
      }
    }
    return states.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  delete(pluginId: string, appId: string, projectId: string): boolean {
    const projectRoot = path.dirname(this.filePath(pluginId, appId, projectId));
    if (!existsSync(projectRoot)) return false;
    rmSync(projectRoot, { recursive: true, force: true });
    return true;
  }

  private projectsRoot(pluginId: string, appId: string): string {
    return path.join(
      this.root,
      safeSegment(pluginId, "plugin ID"),
      "apps",
      safeSegment(appId, "app ID"),
      "projects",
    );
  }

  private filePath(pluginId: string, appId: string, projectId: string): string {
    const projectKey = createHash("sha256").update(projectId).digest("hex");
    return path.join(this.projectsRoot(pluginId, appId), projectKey, "state.json");
  }
}
