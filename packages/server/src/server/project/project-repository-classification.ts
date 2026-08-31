import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import type { PaseoConfigRaw } from "@getpaseo/protocol/paseo-config-schema";
import { resolvePaseoProjectDirectoryEntries } from "@getpaseo/protocol/paseo-config-schema";
import { resolveGitRepositoryManagedPath } from "@getpaseo/protocol/project-git-resource";
import type { PaseoProjectGeneralKnowledgeResource } from "@getpaseo/protocol/project-knowledge-schema";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import {
  readProjectConfigForProject,
  writeProjectConfigForProject,
} from "./project-config-storage.js";
import { resolveManagedProjectStorageRoot } from "./project-storage-paths.js";

const REPOSITORIES_DIRECTORY_NAME = "repos";

interface ConfiguredPath {
  enabled: boolean;
  resolvedPath: string | null;
}

interface RepositoryClassificationInput {
  config: PaseoConfigRaw;
  project: Pick<PersistedProjectRecord, "projectId" | "rootPath">;
  projectRoot: string;
  repositories: readonly string[];
}

export interface RepositoryClassification {
  config: PaseoConfigRaw;
  changed: boolean;
  addedToGeneralKnowledge: string[];
}

interface ReconcileManagedProjectRepositoriesInput {
  paseoHome: string;
  project: Pick<PersistedProjectRecord, "projectId" | "rootPath">;
  logger?: Pick<Logger, "warn">;
}

function replaceVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu, (match, name: string) => {
    return variables[name] ?? match;
  });
}

function resolveConfiguredPath(
  value: string,
  resourceRoot: string,
  variables: Record<string, string>,
): string | null {
  const replaced = replaceVariables(value.trim(), variables);
  if (!replaced || replaced.includes("{{")) return null;
  if (replaced === "~") return homedir();
  if (replaced.startsWith("~/") || replaced.startsWith(`~${path.sep}`)) {
    return path.resolve(homedir(), replaced.slice(2));
  }
  return path.isAbsolute(replaced) ? path.resolve(replaced) : path.resolve(resourceRoot, replaced);
}

function resolveDirectoryEntry(
  entry: { path: string; enabled: boolean },
  resourceRoot: string,
  variables: Record<string, string>,
): ConfiguredPath {
  return {
    enabled: entry.enabled,
    resolvedPath: resolveConfiguredPath(entry.path, resourceRoot, variables),
  };
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function repositoryConfigPath(projectRoot: string, repository: string): string {
  const relative = path.relative(projectRoot, repository).split(path.sep).join("/");
  return `{{projectRoot}}/${relative}`;
}

function resolveGeneralKnowledgePath(
  resource: PaseoProjectGeneralKnowledgeResource,
  projectDirectory: string,
  variables: Record<string, string>,
): string | null {
  if (resource.type === "local-directory") {
    return resolveConfiguredPath(resource.source, projectDirectory, variables);
  }
  if (resource.type !== "git-repository") return null;
  return resolveConfiguredPath(
    resolveGitRepositoryManagedPath({
      repository: resource.source,
      ...(resource.directory ? { directory: resource.directory } : {}),
    }),
    projectDirectory,
    variables,
  );
}

export function listManagedProjectRepositories(projectRoot: string): string[] {
  const repositoriesRoot = path.join(projectRoot, REPOSITORIES_DIRECTORY_NAME);
  if (!existsSync(repositoriesRoot)) return [];
  return readdirSync(repositoriesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(repositoriesRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function classifyManagedProjectRepositories(
  input: RepositoryClassificationInput,
): RepositoryClassification {
  if (input.repositories.length === 0) {
    return { config: input.config, changed: false, addedToGeneralKnowledge: [] };
  }

  const projectDirectory = input.project.rootPath
    ? path.resolve(input.project.rootPath)
    : input.projectRoot;
  const variables = {
    ...input.config.project?.variables,
    projectId: input.project.projectId,
    projectRoot: input.projectRoot,
    projectDirectory,
  };
  const projectEntries = resolvePaseoProjectDirectoryEntries(
    input.config.project?.directories,
  ).project.map((entry) => resolveDirectoryEntry(entry, projectDirectory, variables));
  const generalKnowledge = input.config.project?.knowledge?.general ?? [];
  const resolvedGeneralKnowledge = generalKnowledge.map((resource) => ({
    resource,
    resolvedPath: resolveGeneralKnowledgePath(resource, projectDirectory, variables),
  }));
  const removedKnowledgeIndexes = new Set<number>();
  const additions: PaseoProjectGeneralKnowledgeResource[] = [];

  for (const repository of input.repositories) {
    const resolvedRepository = path.resolve(repository);
    const matchingProjectEntries = projectEntries.filter(
      (entry) => entry.resolvedPath && containsPath(entry.resolvedPath, resolvedRepository),
    );
    const hasEnabledProjectEntry = matchingProjectEntries.some((entry) => entry.enabled);
    if (hasEnabledProjectEntry) {
      resolvedGeneralKnowledge.forEach((entry, index) => {
        if (entry.resolvedPath === resolvedRepository) {
          removedKnowledgeIndexes.add(index);
        }
      });
      continue;
    }
    if (matchingProjectEntries.length > 0) continue;

    const hasKnowledgeEntry = resolvedGeneralKnowledge.some(
      (entry) => entry.resolvedPath && containsPath(entry.resolvedPath, resolvedRepository),
    );
    if (hasKnowledgeEntry) continue;

    additions.push({
      type: "local-directory",
      source: repositoryConfigPath(input.projectRoot, resolvedRepository),
    });
  }

  if (removedKnowledgeIndexes.size === 0 && additions.length === 0) {
    return { config: input.config, changed: false, addedToGeneralKnowledge: [] };
  }

  const retainedKnowledge = generalKnowledge.filter(
    (_resource, index) => !removedKnowledgeIndexes.has(index),
  );
  const nextGeneralKnowledge = [...retainedKnowledge, ...additions];
  const projectConfig = input.config.project ?? {};
  const knowledge = projectConfig.knowledge ?? {};
  return {
    config: {
      ...input.config,
      project: {
        ...projectConfig,
        knowledge: {
          ...knowledge,
          general: nextGeneralKnowledge,
        },
      },
    },
    changed: true,
    addedToGeneralKnowledge: additions.map((resource) => resource.source),
  };
}

export function reconcileManagedProjectRepositories(
  input: ReconcileManagedProjectRepositoriesInput,
): void {
  const projectRoot = resolveManagedProjectStorageRoot(input.paseoHome, input.project.projectId);
  let repositories: string[];
  try {
    repositories = listManagedProjectRepositories(projectRoot);
  } catch (error) {
    input.logger?.warn(
      { err: error, projectId: input.project.projectId, projectRoot },
      "Failed to scan managed Project repositories",
    );
    return;
  }
  if (repositories.length === 0) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = readProjectConfigForProject({
      paseoHome: input.paseoHome,
      project: input.project,
    });
    if (!current.ok) {
      input.logger?.warn(
        { error: current.error, projectId: input.project.projectId },
        "Failed to read Project config while classifying repositories",
      );
      return;
    }
    const classification = classifyManagedProjectRepositories({
      config: current.config ?? {},
      project: input.project,
      projectRoot,
      repositories,
    });
    if (!classification.changed) return;

    const writeResult = writeProjectConfigForProject({
      paseoHome: input.paseoHome,
      project: input.project,
      config: classification.config,
      expectedRevision: current.revision,
    });
    if (writeResult.ok) return;
    const canRetry = writeResult.error.code === "stale_project_config" && attempt === 0;
    if (canRetry) continue;
    input.logger?.warn(
      { error: writeResult.error, projectId: input.project.projectId },
      "Failed to persist managed Project repository classifications",
    );
    return;
  }
}

export function buildProjectRepositoryClassificationPrompt(projectRoot: string): string {
  const repositoriesRoot = path.join(projectRoot, REPOSITORIES_DIRECTORY_NAME);
  const configPath = path.join(projectRoot, "paseo.json");
  return [
    "<paseo_project_repository_policy>",
    `Download Project-owned repositories into first-level directories under ${repositoriesRoot}.`,
    "Whenever you download a repository, you MUST decide its role from the current user request and persist the classification:",
    `- If files in the repository need to be changed, add "{{projectRoot}}/repos/<repository>" to project.directories.project in ${configPath}. Remove an identical local-directory entry from project.knowledge.general.`,
    `- If the repository is only used as reference material, add {"type":"local-directory","source":"{{projectRoot}}/repos/<repository>"} to project.knowledge.general in ${configPath} and do not add it to project.directories.project.`,
    "Keep an existing explicit classification unless the current task requires changing the repository's role. Reclassify a reference repository before modifying it.",
    "Paseo treats an unclassified first-level repository as general knowledge on the next Project context load.",
    "</paseo_project_repository_policy>",
  ].join("\n");
}
