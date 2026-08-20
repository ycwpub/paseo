import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { Logger } from "pino";
import {
  PaseoConfigSchema,
  resolvePaseoProjectDirectoryEntries,
  type PaseoProjectConfig,
} from "@getpaseo/protocol/paseo-config-schema";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import type { PersistedProjectRecord, ProjectRegistry } from "../workspace-registry.js";
import { resolveProjectDirectories } from "./project-context.js";
import { readProjectConfigForProject } from "./project-config-storage.js";

const INDEX_FILE_NAME = "SKILL.md";
const BRANCH_INDEX_DIRECTORY = "branches";
const BRANCH_MANIFEST_FILE = ".paseo-index-branches.json";
const SERVICE_TICK_MS = 30_000;
const MAX_INDEX_ENTRIES = 2_000;
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".expo",
  ".gradle",
]);

export interface ProjectIndexDocumentInput {
  project: Pick<PersistedProjectRecord, "projectId" | "displayName" | "customName" | "rootPath">;
  projectDirectories: readonly string[];
  knowledgeDirectories: readonly string[];
  entries: readonly { kind: "project" | "knowledge"; root: string; path: string }[];
  truncated: boolean;
  branch?: string;
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

export function buildProjectIndexSkillDocument(input: ProjectIndexDocumentInput): string {
  const projectName = input.project.customName ?? input.project.displayName;
  const branchSuffix = input.branch
    ? `-${createHash("sha256").update(input.branch).digest("hex").slice(0, 10)}`
    : "";
  const entryLines = input.entries.map(
    (entry) => `- [${entry.kind}] ${entry.path} (root: ${entry.root})`,
  );
  return [
    "---",
    `name: ${yamlQuoted(`project-index-${input.project.projectId}${branchSuffix}`)}`,
    `description: ${yamlQuoted(
      `Generated index for ${projectName}${input.branch ? ` (${input.branch})` : ""}`,
    )}`,
    "---",
    "",
    `# Project index: ${projectName}`,
    "",
    `Project ID: \`${input.project.projectId}\``,
    `Project root: \`${input.project.rootPath}\``,
    ...(input.branch ? [`Git branch: \`${input.branch}\``] : []),
    "",
    "## Usage",
    "",
    "- Use this index before broad filesystem searches.",
    "- Load project files only when they are relevant to the current task.",
    "- Knowledge roots contain optional background material; load and adopt only the files relevant to the current task.",
    "",
    "## Project roots",
    "",
    ...(input.projectDirectories.length > 0
      ? input.projectDirectories.map((directory) => `- ${directory}`)
      : ["- None"]),
    "",
    "## General knowledge roots",
    "",
    ...(input.knowledgeDirectories.length > 0
      ? input.knowledgeDirectories.map((directory) => `- ${directory}`)
      : ["- None"]),
    "",
    "## Indexed files and directories",
    "",
    ...(entryLines.length > 0 ? entryLines : ["- No readable entries found."]),
    ...(input.truncated
      ? [
          "",
          `> Index truncated after ${MAX_INDEX_ENTRIES} entries. Inspect the listed roots directly for additional files.`,
        ]
      : []),
    "",
  ].join("\n");
}

interface GitRootGroup {
  gitRoot: string;
  roots: Array<{ kind: "project" | "knowledge"; path: string }>;
  branches: string[];
}

function gitOutput(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function collectGitRootGroups(roots: readonly { kind: "project" | "knowledge"; path: string }[]): {
  gitGroups: GitRootGroup[];
  plainRoots: Array<{ kind: "project" | "knowledge"; path: string }>;
} {
  const groups = new Map<string, GitRootGroup>();
  const plainRoots: Array<{ kind: "project" | "knowledge"; path: string }> = [];
  for (const root of roots) {
    const gitRoot = gitOutput(root.path, ["rev-parse", "--show-toplevel"]);
    if (!gitRoot) {
      plainRoots.push(root);
      continue;
    }
    const group = groups.get(gitRoot) ?? { gitRoot, roots: [], branches: [] };
    group.roots.push(root);
    groups.set(gitRoot, group);
  }
  for (const group of groups.values()) {
    group.branches =
      gitOutput(group.gitRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])
        ?.split("\n")
        .map((branch) => branch.trim())
        .filter(Boolean)
        .sort() ?? [];
  }
  return { gitGroups: [...groups.values()], plainRoots };
}

function collectGitBranchEntries(
  group: GitRootGroup,
  branch: string,
): ProjectIndexDocumentInput["entries"] {
  return group.roots.flatMap((root) => {
    let canonicalRoot = root.path;
    try {
      canonicalRoot = realpathSync(root.path);
    } catch {}
    const relativeRoot = path.relative(group.gitRoot, canonicalRoot);
    const args = ["ls-tree", "-r", "--name-only", branch];
    if (relativeRoot) args.push("--", relativeRoot);
    const output = gitOutput(group.gitRoot, args);
    if (!output) return [];
    return output
      .split("\n")
      .filter(Boolean)
      .slice(0, MAX_INDEX_ENTRIES)
      .map((entry) => ({
        kind: root.kind,
        root: root.path,
        path: relativeRoot ? path.relative(relativeRoot, entry) : entry,
      }));
  });
}

function branchIndexRelativePath(gitRoot: string, branch: string): string {
  const repoKey = createHash("sha256").update(gitRoot).digest("hex").slice(0, 12);
  return path.join(BRANCH_INDEX_DIRECTORY, repoKey, encodeURIComponent(branch), INDEX_FILE_NAME);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function collectDirectoryEntries(input: {
  roots: readonly { kind: "project" | "knowledge"; path: string }[];
  excludedRoots: readonly string[];
}): { entries: ProjectIndexDocumentInput["entries"]; truncated: boolean } {
  const entries: Array<{ kind: "project" | "knowledge"; root: string; path: string }> = [];
  let truncated = false;

  const visit = (kind: "project" | "knowledge", root: string, current: string) => {
    if (entries.length >= MAX_INDEX_ENTRIES) {
      truncated = true;
      return;
    }
    if (current !== root && input.excludedRoots.some((excluded) => isWithin(excluded, current))) {
      return;
    }
    let children: Dirent<string>[];
    try {
      children = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (entries.length >= MAX_INDEX_ENTRIES) {
        truncated = true;
        return;
      }
      if (child.isDirectory() && IGNORED_DIRECTORY_NAMES.has(child.name)) continue;
      const absolute = path.join(current, child.name);
      if (input.excludedRoots.some((excluded) => isWithin(excluded, absolute))) continue;
      entries.push({
        kind,
        root,
        path: path.relative(root, absolute) || ".",
      });
      if (child.isDirectory()) visit(kind, root, absolute);
    }
  };

  for (const root of input.roots) {
    if (!existsSync(root.path)) continue;
    visit(root.kind, root.path, root.path);
  }
  return { entries, truncated };
}

function loadProjectConfig(
  paseoHome: string,
  project: PersistedProjectRecord,
): PaseoProjectConfig | undefined {
  const result = readProjectConfigForProject({ paseoHome, project });
  if (!result.ok || result.config === null) return undefined;
  return PaseoConfigSchema.parse(result.config).project;
}

function resolveIndexProjectRoot(
  project: PersistedProjectRecord,
  projectConfig: PaseoProjectConfig | undefined,
): string | null {
  if (project.rootPath) return project.rootPath;
  const configuredRoot = resolvePaseoProjectDirectoryEntries(projectConfig?.directories)
    .project.filter((entry) => entry.enabled)
    .map((entry) => entry.path.trim())
    .find(Boolean);
  if (!configuredRoot) return null;
  if (configuredRoot === "~") return homedir();
  if (configuredRoot.startsWith("~/") || configuredRoot.startsWith(`~${path.sep}`)) {
    return path.resolve(homedir(), configuredRoot.slice(2));
  }
  return path.isAbsolute(configuredRoot) ? path.resolve(configuredRoot) : null;
}

export class ProjectIndexService {
  private readonly projectRegistry: Pick<ProjectRegistry, "list">;
  private readonly daemonConfigStore: DaemonConfigStore;
  private readonly paseoHome: string;
  private readonly logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(input: {
    projectRegistry: Pick<ProjectRegistry, "list">;
    daemonConfigStore: DaemonConfigStore;
    paseoHome: string;
    logger: Logger;
  }) {
    this.projectRegistry = input.projectRegistry;
    this.daemonConfigStore = input.daemonConfigStore;
    this.paseoHome = input.paseoHome;
    this.logger = input.logger.child({ module: "project-index-service" });
  }

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), SERVICE_TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.refreshAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async refreshAll(): Promise<void> {
    const projects = await this.projectRegistry.list();
    await Promise.all(
      projects
        .filter((project) => !project.archivedAt)
        .map((project) =>
          this.refreshProject(project).catch((error) => {
            this.logger.warn(
              { err: error, projectId: project.projectId, rootPath: project.rootPath },
              "Failed to refresh project index Skill",
            );
          }),
        ),
    );
  }

  private async refreshProject(project: PersistedProjectRecord): Promise<void> {
    const projectConfig = loadProjectConfig(this.paseoHome, project);
    if (projectConfig?.indexSkill?.autoGenerate !== true) return;
    const projectRoot = resolveIndexProjectRoot(project, projectConfig);
    if (!projectRoot) return;
    const variables = {
      ...projectConfig.variables,
      projectId: project.projectId,
      projectName: project.customName ?? project.displayName,
      projectRoot,
    };
    const directories = resolveProjectDirectories({
      projectRoot,
      workspaceId: "__project_index__",
      workspaceDirectory: projectRoot,
      projectConfig,
      variables,
    });
    if (directories.indexSkill.length === 0) {
      this.logger.warn(
        { projectId: project.projectId },
        "Project index generation is enabled but no index Skill directory is configured",
      );
      return;
    }
    const intervalMinutes =
      projectConfig.indexSkill.updateIntervalMinutes ??
      this.daemonConfigStore.get().projectIndexing.updateIntervalMinutes;
    const sourceRoots = [
      ...directories.project.map((entry) => ({ kind: "project" as const, path: entry })),
      ...directories.knowledge.map((entry) => ({ kind: "knowledge" as const, path: entry })),
    ];
    const { gitGroups, plainRoots } = collectGitRootGroups(sourceRoots);
    const branchManifest = gitGroups.map((group) => ({
      repository: createHash("sha256").update(group.gitRoot).digest("hex").slice(0, 12),
      branches: group.branches,
    }));
    const serializedManifest = `${JSON.stringify(branchManifest, null, 2)}\n`;
    const now = Date.now();
    const due = directories.indexSkill.some((directory) => {
      const file = path.join(directory, INDEX_FILE_NAME);
      const manifestFile = path.join(directory, BRANCH_MANIFEST_FILE);
      let manifestChanged = branchManifest.length > 0;
      try {
        manifestChanged = existsSync(manifestFile)
          ? readFileSync(manifestFile, "utf8") !== serializedManifest
          : branchManifest.length > 0;
      } catch {
        manifestChanged = true;
      }
      if (manifestChanged) return true;
      const expectedFiles = gitGroups.flatMap((group) =>
        group.branches.map((branch) =>
          path.join(directory, branchIndexRelativePath(group.gitRoot, branch)),
        ),
      );
      if (expectedFiles.some((expected) => !existsSync(expected))) return true;
      if (plainRoots.length > 0 && !existsSync(file)) return true;
      try {
        const files = [...expectedFiles, ...(plainRoots.length > 0 ? [file] : [])];
        return files.some(
          (candidate) => now - statSync(candidate).mtimeMs >= intervalMinutes * 60_000,
        );
      } catch {
        return true;
      }
    });
    if (!due) return;

    const plainCollected = collectDirectoryEntries({
      roots: plainRoots,
      excludedRoots: directories.indexSkill,
    });
    for (const directory of directories.indexSkill) {
      mkdirSync(directory, { recursive: true });
      rmSync(path.join(directory, BRANCH_INDEX_DIRECTORY), { recursive: true, force: true });
      if (plainRoots.length > 0 || gitGroups.length === 0) {
        const content = buildProjectIndexSkillDocument({
          project,
          projectDirectories: directories.project,
          knowledgeDirectories: directories.knowledge,
          entries: plainCollected.entries,
          truncated: plainCollected.truncated,
        });
        writeFileSync(path.join(directory, INDEX_FILE_NAME), content);
      } else {
        try {
          unlinkSync(path.join(directory, INDEX_FILE_NAME));
        } catch {}
      }
      for (const group of gitGroups) {
        for (const branch of group.branches) {
          const outputFile = path.join(directory, branchIndexRelativePath(group.gitRoot, branch));
          mkdirSync(path.dirname(outputFile), { recursive: true });
          const entries = collectGitBranchEntries(group, branch);
          writeFileSync(
            outputFile,
            buildProjectIndexSkillDocument({
              project,
              projectDirectories: group.roots
                .filter((root) => root.kind === "project")
                .map((root) => root.path),
              knowledgeDirectories: group.roots
                .filter((root) => root.kind === "knowledge")
                .map((root) => root.path),
              entries,
              truncated: entries.length >= MAX_INDEX_ENTRIES,
              branch,
            }),
          );
        }
      }
      writeFileSync(path.join(directory, BRANCH_MANIFEST_FILE), serializedManifest);
    }
    this.logger.info(
      {
        projectId: project.projectId,
        indexDirectories: directories.indexSkill,
        entryCount:
          plainCollected.entries.length +
          gitGroups.reduce(
            (count, group) =>
              count +
              group.branches.reduce(
                (branchCount, branch) =>
                  branchCount + collectGitBranchEntries(group, branch).length,
                0,
              ),
            0,
          ),
        truncated: plainCollected.truncated,
        branchCount: branchManifest.reduce((count, group) => count + group.branches.length, 0),
      },
      "Project index Skill refreshed",
    );
  }
}
