import type { PaseoProjectConfig } from "@getpaseo/protocol/paseo-config-schema";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { resolveProjectResourceDirectories } from "@/utils/project-resource-directories";

export const FILES_PANEL_DIRECTORY_SCOPE_IDS = [
  "project",
  "workspace",
  "projectDirectories",
  "projectKnowledge",
  "agentKnowledge",
] as const;

export type FilesPanelDirectoryScopeId = (typeof FILES_PANEL_DIRECTORY_SCOPE_IDS)[number];

export interface FilesPanelDirectoryScope {
  id: FilesPanelDirectoryScopeId;
  label: string;
  roots: string[];
}

const AGENT_KNOWLEDGE_DIRECTORY_NAMES = [
  ".agents",
  ".agent",
  ".claude",
  ".codex",
  ".trae",
] as const;

const FILES_PANEL_DIRECTORY_SCOPE_LABELS: Record<FilesPanelDirectoryScopeId, string> = {
  project: "Project 目录",
  workspace: "Workspace 目录",
  projectDirectories: "项目目录",
  projectKnowledge: "Project 知识",
  agentKnowledge: "Agent 知识",
};

function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/gu, "/");
  if (!trimmed) return "";
  if (trimmed === "/" || /^[A-Za-z]:\/$/u.test(trimmed)) return trimmed;
  return trimmed.replace(/\/+$/u, "");
}

function joinPath(root: string, ...segments: string[]): string {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) return "";
  return [normalizedRoot, ...segments.map((segment) => segment.replace(/^\/+|\/+$/gu, ""))]
    .filter(Boolean)
    .join("/");
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = normalizePath(path);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isAgentKnowledgeDirectory(path: string): boolean {
  const normalized = normalizePath(path);
  return AGENT_KNOWLEDGE_DIRECTORY_NAMES.some(
    (directory) => normalized === directory || normalized.endsWith(`/${directory}`),
  );
}

export function resolveFilesPanelDirectoryScopes(input: {
  workspace: WorkspaceDescriptor;
  projectConfig: PaseoProjectConfig | null | undefined;
}): FilesPanelDirectoryScope[] {
  const { workspace } = input;
  const projectRoot = normalizePath(workspace.projectRootPath);
  const workspaceDirectory = normalizePath(workspace.workspaceDirectory);
  const resourceDirectories = resolveProjectResourceDirectories({
    projectConfig: input.projectConfig,
    context: {
      projectId: workspace.projectId,
      projectName: workspace.projectDisplayName,
      projectRoot,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceDirectory,
    },
  });

  const automaticAgentKnowledge = resourceDirectories.knowledge.filter(isAgentKnowledgeDirectory);
  const configuredProjectKnowledge = resourceDirectories.knowledge.filter(
    (path) => !isAgentKnowledgeDirectory(path),
  );
  const managedWorkspaceRoot = projectRoot ? joinPath(projectRoot, "workspaces", workspace.id) : "";
  const defaultWorkspaceRoot = `~/.paseo/projects/${workspace.projectId}/workspaces/${workspace.id}`;
  const workspaceRoots = uniquePaths([
    managedWorkspaceRoot,
    ...resourceDirectories.workspaceData.map((path) =>
      normalizePath(path) === defaultWorkspaceRoot ? managedWorkspaceRoot : path,
    ),
  ]);
  const projectKnowledgeRoots = uniquePaths([
    projectRoot ? joinPath(projectRoot, "knowledge") : "",
    ...configuredProjectKnowledge,
  ]);
  const agentKnowledgeRoots = uniquePaths([
    ...resourceDirectories.indexSkill,
    ...automaticAgentKnowledge,
    ...AGENT_KNOWLEDGE_DIRECTORY_NAMES.map((name) => joinPath(projectRoot, name)),
  ]);

  const rootsByScope: Record<FilesPanelDirectoryScopeId, string[]> = {
    project: uniquePaths([projectRoot]),
    workspace: workspaceRoots,
    projectDirectories: uniquePaths(resourceDirectories.project),
    projectKnowledge: projectKnowledgeRoots,
    agentKnowledge: agentKnowledgeRoots,
  };

  return FILES_PANEL_DIRECTORY_SCOPE_IDS.map((id) => ({
    id,
    label: FILES_PANEL_DIRECTORY_SCOPE_LABELS[id],
    roots: rootsByScope[id],
  }));
}

export function resolveFilesPanelPath(input: {
  root: string;
  workspaceDirectory: string;
  entryPath: string;
  buildAbsolutePath: (input: { workspaceRoot: string; entryPath: string }) => string;
}): string {
  const root = normalizePath(input.root);
  const workspaceDirectory = normalizePath(input.workspaceDirectory);
  if (root === workspaceDirectory) return input.entryPath;
  return input.buildAbsolutePath({ workspaceRoot: root, entryPath: input.entryPath });
}
