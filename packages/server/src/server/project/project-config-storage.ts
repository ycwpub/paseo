import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  PaseoConfigRawSchema,
  resolvePaseoProjectDirectoryEntries,
  type PaseoConfigRaw,
  type PaseoConfigRevision,
  type ProjectConfigRpcError,
} from "@getpaseo/protocol/paseo-config-schema";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import {
  paseoConfigRevisionsEqual,
  PASEO_CONFIG_FILE_NAME,
  readPaseoConfigFileForEdit,
  resolvePaseoConfigPath,
  statPaseoConfigFile,
  writePaseoConfigFileForEdit,
} from "../../utils/paseo-config-file.js";
import {
  resolveManagedProjectPath,
  resolveManagedProjectStorageRoot,
  resolveProjectPath,
} from "./project-storage-paths.js";

export type ProjectConfigStorageProject = Pick<PersistedProjectRecord, "projectId" | "rootPath">;

export interface ProjectConfigReadSuccess {
  ok: true;
  config: PaseoConfigRaw | null;
  revision: PaseoConfigRevision | null;
  configPath: string;
  mode: "single" | "multiple";
}

export type ProjectConfigReadResult =
  | ProjectConfigReadSuccess
  | { ok: false; error: ProjectConfigRpcError };

export interface ProjectConfigWriteSuccess {
  ok: true;
  config: PaseoConfigRaw;
  revision: PaseoConfigRevision;
  configPath: string;
  mode: "single" | "multiple";
  projectRoot: string | null;
}

export type ProjectConfigWriteResult =
  | ProjectConfigWriteSuccess
  | { ok: false; error: ProjectConfigRpcError };

const GLOBAL_PROJECT_CONFIG_DIRECTORY = path.join("projects", "configs");

export function resolveGlobalProjectConfigPath(paseoHome: string, projectId: string): string {
  return path.join(resolveManagedProjectStorageRoot(paseoHome, projectId), PASEO_CONFIG_FILE_NAME);
}

function resolveLegacyManagedProjectConfigPath(paseoHome: string, projectId: string): string {
  return path.join(resolveManagedProjectPath(paseoHome, projectId), PASEO_CONFIG_FILE_NAME);
}

function resolveLegacyGlobalProjectConfigPath(paseoHome: string, projectId: string): string {
  const projectKey = createHash("sha256").update(projectId).digest("hex");
  return path.join(paseoHome, GLOBAL_PROJECT_CONFIG_DIRECTORY, projectKey, PASEO_CONFIG_FILE_NAME);
}

export function createDirectorylessProjectConfig(): PaseoConfigRaw {
  return {
    project: {
      directoryMode: "multiple",
      directories: {
        project: [],
      },
    },
  };
}

export function resolveProjectConfigDirectories(input: {
  paseoHome: string;
  project: ProjectConfigStorageProject;
  config: PaseoConfigRaw | null;
}): string[] {
  const projectRoot = resolveProjectPath({
    paseoHome: input.paseoHome,
    project: input.project,
  });
  const projectDirectoryRoot = input.project.rootPath?.trim()
    ? path.resolve(input.project.rootPath)
    : projectRoot;
  const directories = input.config?.project?.directories;
  if (!directories || !Object.prototype.hasOwnProperty.call(directories, "project")) {
    return input.project.rootPath === null ? [projectRoot] : [projectDirectoryRoot];
  }
  const variables: Record<string, string> = {
    ...input.config?.project?.variables,
    projectId: input.project.projectId,
    projectRoot,
  };
  const configuredDirectories = Array.from(
    new Set(
      resolvePaseoProjectDirectoryEntries(directories)
        .project.filter((entry) => entry.enabled)
        .map((entry) => replaceProjectConfigVariables(entry.path.trim(), variables))
        .filter((entry) => entry.length > 0 && !entry.includes("{{"))
        .flatMap((entry) => {
          if (entry === "~") return [homedir()];
          if (entry.startsWith("~/") || entry.startsWith(`~${path.sep}`)) {
            return [path.resolve(homedir(), entry.slice(2))];
          }
          if (path.isAbsolute(entry)) return [path.resolve(entry)];
          return [path.resolve(projectDirectoryRoot, entry)];
        }),
    ),
  );
  return input.project.rootPath === null
    ? Array.from(new Set([projectRoot, ...configuredDirectories]))
    : configuredDirectories;
}

export function readProjectConfigForProject(input: {
  paseoHome: string;
  project: ProjectConfigStorageProject;
}): ProjectConfigReadResult {
  const managedPath = resolveGlobalProjectConfigPath(input.paseoHome, input.project.projectId);
  const legacyManagedPath = resolveLegacyManagedProjectConfigPath(
    input.paseoHome,
    input.project.projectId,
  );
  const legacyGlobalPath = resolveLegacyGlobalProjectConfigPath(
    input.paseoHome,
    input.project.projectId,
  );
  const localPath = resolveLocalProjectConfigPath(input.project);
  const managedResult = readPaseoConfigFileForEdit(managedPath);
  if (!managedResult.ok) return managedResult;
  if (managedResult.config !== null) {
    return locateProjectConfig(
      managedResult,
      managedPath,
      input.project.rootPath === null ? "multiple" : "single",
    );
  }

  const localResult = localPath ? readPaseoConfigFileForEdit(localPath) : null;
  if (localResult?.ok && localResult.config?.project?.directoryMode === "single") {
    return locateProjectConfig(localResult, localPath!, "single");
  }

  const legacyManagedResult = readPaseoConfigFileForEdit(legacyManagedPath);
  if (!legacyManagedResult.ok) return legacyManagedResult;
  if (legacyManagedResult.config !== null) {
    return locateProjectConfig(legacyManagedResult, legacyManagedPath, "multiple");
  }

  const legacyGlobalResult = readPaseoConfigFileForEdit(legacyGlobalPath);
  if (!legacyGlobalResult.ok) return legacyGlobalResult;
  if (legacyGlobalResult.config !== null) {
    return locateProjectConfig(legacyGlobalResult, legacyGlobalPath, "multiple");
  }
  if (localResult && !localResult.ok) return localResult;
  if (localResult?.config) {
    return locateProjectConfig(localResult, localPath!, "single");
  }

  if (input.project.rootPath === null) {
    return {
      ok: true,
      config: createDirectorylessProjectConfig(),
      revision: null,
      configPath: managedPath,
      mode: "multiple",
    };
  }
  return {
    ok: true,
    config: null,
    revision: null,
    configPath: managedPath,
    mode: "single",
  };
}

function resolveLocalProjectConfigPath(project: ProjectConfigStorageProject): string | null {
  return project.rootPath === null ? null : resolvePaseoConfigPath(project.rootPath);
}

function locateProjectConfig(
  result: Extract<ReturnType<typeof readPaseoConfigFileForEdit>, { ok: true }>,
  configPath: string,
  fallbackMode: "single" | "multiple",
): ProjectConfigReadSuccess {
  return {
    ...result,
    configPath,
    mode: result.config?.project?.directoryMode ?? fallbackMode,
  };
}

export function initializeDirectorylessProjectConfig(input: {
  paseoHome: string;
  project: ProjectConfigStorageProject;
}): ProjectConfigWriteResult {
  return writeProjectConfigForProject({
    ...input,
    config: createDirectorylessProjectConfig(),
    expectedRevision: null,
  });
}

export function writeProjectConfigForProject(input: {
  paseoHome: string;
  project: ProjectConfigStorageProject;
  config: PaseoConfigRaw;
  expectedRevision: PaseoConfigRevision | null;
}): ProjectConfigWriteResult {
  const parsed = PaseoConfigRawSchema.safeParse(input.config);
  if (!parsed.success) {
    return { ok: false, error: { code: "invalid_project_config" } };
  }

  const current = readProjectConfigForProject(input);
  if (!current.ok) return current;
  if (!paseoConfigRevisionsEqual(current.revision, input.expectedRevision)) {
    return {
      ok: false,
      error: {
        code: "stale_project_config",
        currentRevision: current.revision,
      },
    };
  }

  const mode =
    parsed.data.project?.directoryMode ?? (input.project.rootPath === null ? "multiple" : "single");
  const projectRoot =
    mode === "single"
      ? resolveSingleProjectDirectory(input.project, parsed.data)
      : input.project.rootPath;
  if (mode === "single" && projectRoot === null) {
    return { ok: false, error: { code: "invalid_project_config" } };
  }
  const targetPath = resolveGlobalProjectConfigPath(input.paseoHome, input.project.projectId);
  const targetDirectory = path.dirname(targetPath);
  try {
    mkdirSync(targetDirectory, { recursive: true });
  } catch {
    return { ok: false, error: { code: "write_failed" } };
  }

  const targetRevision =
    targetPath === current.configPath ? input.expectedRevision : statPaseoConfigFile(targetPath);
  const writeResult = writePaseoConfigFileForEdit({
    configPath: targetPath,
    config: parsed.data,
    expectedRevision: targetRevision,
  });
  if (!writeResult.ok) return writeResult;

  if (targetPath !== current.configPath && existsSync(current.configPath)) {
    const sourceRevision = statPaseoConfigFile(current.configPath);
    if (!paseoConfigRevisionsEqual(sourceRevision, input.expectedRevision)) {
      return {
        ok: false,
        error: {
          code: "stale_project_config",
          currentRevision: sourceRevision,
        },
      };
    }
    try {
      rmSync(current.configPath);
      removeEmptyLegacyConfigDirectory(
        input.paseoHome,
        input.project.projectId,
        current.configPath,
      );
    } catch {
      return { ok: false, error: { code: "write_failed" } };
    }
  }

  return {
    ...writeResult,
    configPath: targetPath,
    mode,
    projectRoot,
  };
}

function replaceProjectConfigVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu, (match, name: string) => {
    return variables[name] ?? match;
  });
}

function resolveSingleProjectDirectory(
  project: ProjectConfigStorageProject,
  config: PaseoConfigRaw,
): string | null {
  if (
    !config.project?.directories ||
    !Object.prototype.hasOwnProperty.call(config.project.directories, "project")
  ) {
    return project.rootPath;
  }
  const configured = resolvePaseoProjectDirectoryEntries(config.project?.directories)
    .project.filter((entry) => entry.enabled)
    .map((entry) => entry.path.trim())
    .filter(Boolean);
  if (configured.length > 1) return null;
  const candidate = configured[0];
  if (!candidate) return project.rootPath;
  if (candidate === "~") return homedir();
  if (candidate.startsWith("~/") || candidate.startsWith(`~${path.sep}`)) {
    return path.resolve(homedir(), candidate.slice(2));
  }
  if (path.isAbsolute(candidate)) return path.resolve(candidate);
  if (project.rootPath === null) return null;
  return path.resolve(project.rootPath, candidate);
}

function removeEmptyLegacyConfigDirectory(
  paseoHome: string,
  projectId: string,
  configPath: string,
): void {
  const allowedParents = new Set([
    path.dirname(resolveLegacyManagedProjectConfigPath(paseoHome, projectId)),
    path.dirname(resolveLegacyGlobalProjectConfigPath(paseoHome, projectId)),
  ]);
  const parent = path.dirname(configPath);
  if (!allowedParents.has(parent)) return;
  try {
    rmdirSync(parent);
  } catch {
    // The directory may contain future project-owned files; leave it intact.
  }
}
