import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import {
  PaseoConfigSchema,
  resolvePaseoProjectDirectoryValues,
  type PaseoProjectConfig,
} from "@getpaseo/protocol/paseo-config-schema";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import { normalizeWritableProjectDirectories } from "../agent/project-directory-access.js";
import { composeSystemPromptParts } from "../agent/system-prompt.js";
import type {
  PersistedProjectRecord,
  PersistedWorkspaceRecord,
  ProjectRegistry,
  WorkspaceRegistry,
} from "../workspace-registry.js";
import { readPaseoConfigJson } from "../../utils/paseo-config-file.js";
import { readProjectConfigForProject } from "./project-config-storage.js";
import {
  buildProjectKnowledgePrompt,
  EMPTY_PROJECT_KNOWLEDGE,
  resolveProjectKnowledge,
  type ResolvedProjectKnowledge,
} from "./project-knowledge-context.js";
import {
  ensureManagedProjectCodeReposPath,
  ensureManagedWorkspacePath,
  resolveManagedWorkspacePath,
  resolveProjectPath as resolveProjectStoragePath,
} from "./project-storage-paths.js";

const DEFAULT_PASEO_WORKSPACE_DATA_DIRECTORY = "~/.paseo/{{projectId}}/workspaces/{{workspaceId}}";

export interface ResolvedProjectDirectories {
  project: string[];
  knowledge: string[];
  indexSkill: string[];
  workspaceData: string[];
}

export interface ProjectAgentContext {
  project: PersistedProjectRecord;
  workspace: PersistedWorkspaceRecord;
  directories: ResolvedProjectDirectories;
  knowledge: ResolvedProjectKnowledge;
  variables: Record<string, string>;
  prompt: string;
}

const AI_KNOWLEDGE_DIRECTORY_NAMES = [".agents", ".agent", ".claude", ".codex", ".trae"] as const;

function replaceVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu, (match, name: string) => {
    return variables[name] ?? match;
  });
}

function resolvePathList(
  projectRoot: string,
  values: readonly string[] | undefined,
  variables: Record<string, string>,
): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => replaceVariables(value.trim(), variables))
        .filter(Boolean)
        .map((value) => resolveProjectPath(projectRoot, value)),
    ),
  );
}

function resolveProjectPath(projectRoot: string, value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.resolve(homedir(), value.slice(2));
  }
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

export function resolveProjectDirectories(input: {
  projectId: string;
  projectRoot: string;
  workspaceId: string;
  workspaceDirectory: string;
  projectConfig: PaseoProjectConfig | undefined;
  paseoHome?: string;
  variables?: Record<string, string>;
}): ResolvedProjectDirectories {
  const variables = {
    ...input.variables,
    projectId: input.projectId,
    projectRoot: input.projectRoot,
    workspaceId: input.workspaceId,
    workspaceDirectory: input.workspaceDirectory,
  };
  const directoryValues = resolvePaseoProjectDirectoryValues(input.projectConfig?.directories);
  const configuredProject = resolvePathList(input.projectRoot, directoryValues.project, variables);
  const configuredKnowledge = resolvePathList(
    input.projectRoot,
    directoryValues.knowledge,
    variables,
  );
  const configuredGeneralKnowledge = resolvePathList(
    input.projectRoot,
    input.projectConfig?.knowledge?.general
      ?.filter((resource) => resource.enabled !== false && resource.type === "local-directory")
      .map((resource) => resource.source),
    variables,
  );
  let automaticKnowledge: string[] = [];
  if ((input.projectConfig?.directoryMode ?? "single") === "single" && configuredProject[0]) {
    automaticKnowledge = AI_KNOWLEDGE_DIRECTORY_NAMES.map((name) =>
      path.join(configuredProject[0]!, name),
    );
  }
  const knowledge = Array.from(
    new Set([
      ...configuredKnowledge,
      ...configuredGeneralKnowledge,
      ...automaticKnowledge.filter((entry) => existsSync(entry)),
    ]),
  );
  const workspaceData = Array.from(
    new Set(
      directoryValues.workspaceData.flatMap((rawValue) => {
        if (input.paseoHome && rawValue.trim() === DEFAULT_PASEO_WORKSPACE_DATA_DIRECTORY) {
          return [resolveManagedWorkspacePath(input.paseoHome, input.projectId, input.workspaceId)];
        }
        const value = replaceVariables(rawValue.trim(), variables);
        if (!value) return [];
        const root = resolveProjectPath(input.projectRoot, value);
        return [rawValue.includes("{{workspaceId}}") ? root : path.join(root, input.workspaceId)];
      }),
    ),
  );

  let projectDirectories: string[];
  if (input.projectConfig?.directoryMode === "multiple") {
    projectDirectories = Array.from(
      new Set([path.resolve(input.projectRoot), ...configuredProject]),
    );
  } else if (configuredProject.length > 0) {
    projectDirectories = configuredProject;
  } else {
    projectDirectories = [path.resolve(input.workspaceDirectory)];
  }

  return {
    project: projectDirectories,
    knowledge,
    indexSkill: resolvePathList(input.projectRoot, directoryValues.indexSkill, variables),
    workspaceData,
  };
}

function formatDirectoryList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None configured";
}

export function buildProjectContextPrompt(input: {
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceDirectory: string;
  directories: ResolvedProjectDirectories;
  knowledge?: ResolvedProjectKnowledge;
}): string {
  const indexInstructions =
    input.directories.indexSkill.length > 0
      ? [
          "Before broad filesystem exploration, read the applicable SKILL.md files in the index Skill directories. Use those indexes to locate relevant project and knowledge files quickly.",
          formatDirectoryList(input.directories.indexSkill),
        ].join("\n")
      : "No index Skill is configured. Inspect the Project and general knowledge directories directly.";

  return [
    "<paseo_project_context>",
    `Project ID: ${input.projectId}`,
    `Project name: ${input.projectName}`,
    `Workspace ID: ${input.workspaceId}`,
    `Primary working directory: ${input.workspaceDirectory}`,
    "All Project directories listed below are writable working directories in the same logical Project. A multiple-directory Project includes a private code_repos directory for Project-owned code plus its configured code directories. Read and modify the directory appropriate to the task; do not assume the primary working directory is the only writable directory.",
    "",
    "Project directories (read on demand; do not load everything unless needed):",
    formatDirectoryList(input.directories.project),
    "",
    "General knowledge directories (read on demand; protected by default):",
    formatDirectoryList(input.directories.knowledge),
    input.directories.knowledge.length > 0
      ? [
          "Read only the files relevant to the current task and decide whether their guidance applies.",
          "By default, you MUST NOT create, modify, rename, move, or delete content in knowledge directories.",
          "You may update knowledge content only when the user explicitly asks to update Project knowledge in the current conversation. A request to change product code or ordinary documentation is not permission to change knowledge.",
          "When explicitly authorized, change only the knowledge files needed for that request.",
        ].join(" ")
      : "No additional knowledge directory is configured.",
    "",
    "Index Skill:",
    indexInstructions,
    "",
    "Workspace data directories (use these for resumable process notes, review artifacts, and outputs):",
    formatDirectoryList(input.directories.workspaceData),
    input.directories.workspaceData.length > 0
      ? "Record durable progress and important outputs here so interrupted work can be reviewed and continued."
      : "No dedicated workspace data directory is configured.",
    "</paseo_project_context>",
    buildProjectKnowledgePrompt({
      generalDirectories: input.directories.knowledge,
      knowledge: input.knowledge ?? EMPTY_PROJECT_KNOWLEDGE,
    }),
  ].join("\n");
}

function readProjectConfig(
  project: PersistedProjectRecord,
  projectRoot: string,
  paseoHome?: string,
  logger?: Pick<Logger, "warn">,
): PaseoProjectConfig | undefined {
  try {
    if (paseoHome) {
      const result = readProjectConfigForProject({ paseoHome, project });
      if (!result.ok) {
        throw new Error(result.error.code);
      }
      return result.config === null ? undefined : PaseoConfigSchema.parse(result.config).project;
    }
    const legacyJson = readPaseoConfigJson(projectRoot);
    return legacyJson === null ? undefined : PaseoConfigSchema.parse(legacyJson).project;
  } catch (error) {
    logger?.warn(
      { err: error, projectId: project.projectId, projectRoot },
      "Failed to load project context from paseo.json",
    );
    return undefined;
  }
}

export async function loadProjectAgentContext(input: {
  workspaceId: string;
  projectRegistry: Pick<ProjectRegistry, "get">;
  workspaceRegistry: Pick<WorkspaceRegistry, "get">;
  paseoHome?: string;
  logger?: Pick<Logger, "warn">;
}): Promise<ProjectAgentContext | null> {
  const workspace = await input.workspaceRegistry.get(input.workspaceId);
  if (!workspace) return null;
  const project = await input.projectRegistry.get(workspace.projectId);
  if (!project) return null;

  const projectRoot = input.paseoHome
    ? resolveProjectStoragePath({ paseoHome: input.paseoHome, project })
    : (project.rootPath ?? workspace.cwd);
  if (input.paseoHome && project.rootPath === null) {
    ensureManagedProjectCodeReposPath(input.paseoHome, project.projectId);
  }
  const projectConfig = readProjectConfig(project, projectRoot, input.paseoHome, input.logger);
  const variables = {
    ...projectConfig?.variables,
    projectId: project.projectId,
    projectName: project.customName ?? project.displayName,
    projectRoot,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.title ?? workspace.displayName,
    workspaceDirectory: workspace.cwd,
  };
  const directories = resolveProjectDirectories({
    projectId: project.projectId,
    projectRoot,
    workspaceId: workspace.workspaceId,
    workspaceDirectory: workspace.cwd,
    projectConfig,
    paseoHome: input.paseoHome,
    variables,
  });
  const knowledge = resolveProjectKnowledge({
    projectConfig,
    projectId: project.projectId,
    logger: input.logger,
    resolveLocalPath: (source) =>
      resolveProjectPath(projectRoot, replaceVariables(source.trim(), variables)),
  });
  const managedWorkspacePath = input.paseoHome
    ? resolveManagedWorkspacePath(input.paseoHome, project.projectId, workspace.workspaceId)
    : null;
  if (
    input.paseoHome &&
    managedWorkspacePath &&
    directories.workspaceData.includes(managedWorkspacePath)
  ) {
    ensureManagedWorkspacePath(input.paseoHome, project.projectId, workspace.workspaceId);
  }
  for (const directory of directories.workspaceData) {
    try {
      mkdirSync(directory, { recursive: true });
    } catch (error) {
      input.logger?.warn(
        { err: error, directory, workspaceId: workspace.workspaceId },
        "Failed to create project workspace data directory",
      );
    }
  }
  return {
    project,
    workspace,
    directories,
    knowledge,
    variables,
    prompt: buildProjectContextPrompt({
      projectId: project.projectId,
      projectName: project.customName ?? project.displayName,
      workspaceId: workspace.workspaceId,
      workspaceDirectory: workspace.cwd,
      directories,
      knowledge,
    }),
  };
}

export async function withProjectAgentContext(input: {
  config: AgentSessionConfig;
  workspaceId: string;
  projectRegistry: Pick<ProjectRegistry, "get">;
  workspaceRegistry: Pick<WorkspaceRegistry, "get">;
  paseoHome?: string;
  logger?: Pick<Logger, "warn">;
}): Promise<AgentSessionConfig> {
  const context = await loadProjectAgentContext(input);
  if (!context) return input.config;
  const writableProjectDirectories = normalizeWritableProjectDirectories(
    context.directories.project,
  );
  return {
    ...input.config,
    writableProjectDirectories,
    systemPrompt: composeSystemPromptParts(input.config.systemPrompt, context.prompt),
  };
}
