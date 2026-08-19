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
  projectRoot: string;
  workspaceId: string;
  workspaceDirectory: string;
  projectConfig: PaseoProjectConfig | undefined;
  variables?: Record<string, string>;
}): ResolvedProjectDirectories {
  const variables = {
    ...input.variables,
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
  let automaticKnowledge: string[] = [];
  if ((input.projectConfig?.directoryMode ?? "single") === "single" && configuredProject[0]) {
    automaticKnowledge = AI_KNOWLEDGE_DIRECTORY_NAMES.map((name) =>
      path.join(configuredProject[0]!, name),
    );
  }
  const knowledge = Array.from(
    new Set([...configuredKnowledge, ...automaticKnowledge.filter((entry) => existsSync(entry))]),
  );
  const workspaceData = Array.from(
    new Set(
      directoryValues.workspaceData.flatMap((rawValue) => {
        const value = replaceVariables(rawValue.trim(), variables);
        if (!value) return [];
        const root = resolveProjectPath(input.projectRoot, value);
        return [rawValue.includes("{{workspaceId}}") ? root : path.join(root, input.workspaceId)];
      }),
    ),
  );

  return {
    project:
      configuredProject.length > 0 ? configuredProject : [path.resolve(input.workspaceDirectory)],
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
}): string {
  const indexInstructions =
    input.directories.indexSkill.length > 0
      ? [
          "Before broad filesystem exploration, read the applicable SKILL.md files in the index Skill directories. Use those indexes to locate relevant project and knowledge files quickly.",
          formatDirectoryList(input.directories.indexSkill),
        ].join("\n")
      : "No index Skill is configured. Inspect the project and knowledge directories directly.";

  return [
    "<paseo_project_context>",
    `Project ID: ${input.projectId}`,
    `Project name: ${input.projectName}`,
    `Workspace ID: ${input.workspaceId}`,
    `Primary working directory: ${input.workspaceDirectory}`,
    "All Project directories listed below are writable repositories in the same logical Project. Read and modify the repository appropriate to the task; do not assume the primary working directory is the only writable repository.",
    "",
    "Project directories (read on demand; do not load everything unless needed):",
    formatDirectoryList(input.directories.project),
    "",
    "Knowledge directories (mandatory instructions):",
    formatDirectoryList(input.directories.knowledge),
    input.directories.knowledge.length > 0
      ? "You MUST inspect and obey all knowledge files applicable to the current task before making changes. Treat them as project-level instructions."
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
  ].join("\n");
}

function readProjectConfig(
  projectRoot: string,
  logger?: Pick<Logger, "warn">,
): PaseoProjectConfig | undefined {
  try {
    const json = readPaseoConfigJson(projectRoot);
    if (json === null) return undefined;
    return PaseoConfigSchema.parse(json).project;
  } catch (error) {
    logger?.warn({ err: error, projectRoot }, "Failed to load project context from paseo.json");
    return undefined;
  }
}

export async function loadProjectAgentContext(input: {
  workspaceId: string;
  projectRegistry: Pick<ProjectRegistry, "get">;
  workspaceRegistry: Pick<WorkspaceRegistry, "get">;
  logger?: Pick<Logger, "warn">;
}): Promise<ProjectAgentContext | null> {
  const workspace = await input.workspaceRegistry.get(input.workspaceId);
  if (!workspace) return null;
  const project = await input.projectRegistry.get(workspace.projectId);
  if (!project) return null;

  const projectRoot = project.rootPath ?? workspace.cwd;
  const projectConfig = readProjectConfig(projectRoot, input.logger);
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
    projectRoot,
    workspaceId: workspace.workspaceId,
    workspaceDirectory: workspace.cwd,
    projectConfig,
    variables,
  });
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
    variables,
    prompt: buildProjectContextPrompt({
      projectId: project.projectId,
      projectName: project.customName ?? project.displayName,
      workspaceId: workspace.workspaceId,
      workspaceDirectory: workspace.cwd,
      directories,
    }),
  };
}

export async function withProjectAgentContext(input: {
  config: AgentSessionConfig;
  workspaceId: string;
  projectRegistry: Pick<ProjectRegistry, "get">;
  workspaceRegistry: Pick<WorkspaceRegistry, "get">;
  logger?: Pick<Logger, "warn">;
}): Promise<AgentSessionConfig> {
  const context = await loadProjectAgentContext(input);
  if (!context) return input.config;
  return {
    ...input.config,
    writableProjectDirectories: normalizeWritableProjectDirectories(context.directories.project),
    systemPrompt: composeSystemPromptParts(input.config.systemPrompt, context.prompt),
  };
}
