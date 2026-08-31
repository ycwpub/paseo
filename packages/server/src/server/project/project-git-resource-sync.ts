import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "pino";
import type { PaseoProjectConfig } from "@getpaseo/protocol/paseo-config-schema";
import { inferGitRepositoryDirectoryName } from "@getpaseo/protocol/project-git-resource";
import type { RunGitCommand } from "../../utils/run-git-command.js";
import { runGitCommand } from "../../utils/run-git-command.js";

const GIT_TIMEOUT_MS = 120_000;
const GIT_ENV = { GIT_TERMINAL_PROMPT: "0" } as const;
const SAFE_DIRECTORY_NAME = /^[A-Za-z0-9._-]+$/u;
const resourceSyncs = new Map<string, Promise<void>>();

export interface ProjectGitResource {
  repository: string;
  branch?: string;
  directory: string;
  destination: string;
  role: "project" | "knowledge";
}

interface SyncProjectGitResourcesInput {
  projectRoot: string;
  projectConfig: PaseoProjectConfig | undefined;
  logger?: Pick<Logger, "warn">;
  runGit?: RunGitCommand;
  includeProjectDirectories?: boolean;
}

function configuredProjectGitResources(input: SyncProjectGitResourcesInput): ProjectGitResource[] {
  if (input.includeProjectDirectories === false) return [];
  return (input.projectConfig?.directories?.project ?? []).flatMap((entry) => {
    if (
      typeof entry === "string" ||
      entry.type !== "git-repository" ||
      !("repository" in entry) ||
      typeof entry.repository !== "string" ||
      entry.enabled === false
    ) {
      return [];
    }
    const branch = "branch" in entry && typeof entry.branch === "string" ? entry.branch : undefined;
    const directory =
      "directory" in entry && typeof entry.directory === "string" ? entry.directory : undefined;
    return [
      resolveResource({
        projectRoot: input.projectRoot,
        repository: entry.repository,
        branch,
        directory,
        role: "project",
      }),
    ];
  });
}

function configuredKnowledgeGitResources(
  input: SyncProjectGitResourcesInput,
): ProjectGitResource[] {
  return (input.projectConfig?.knowledge?.general ?? []).flatMap((entry) => {
    if (entry.type !== "git-repository" || entry.enabled === false) return [];
    return [
      resolveResource({
        projectRoot: input.projectRoot,
        repository: entry.source,
        branch: entry.branch,
        directory: entry.directory,
        role: "knowledge",
      }),
    ];
  });
}

function deduplicateGitResources(resources: readonly ProjectGitResource[]): ProjectGitResource[] {
  const destinations = new Map<string, ProjectGitResource>();
  for (const resource of resources) {
    const existing = destinations.get(resource.destination);
    if (
      existing &&
      (existing.repository !== resource.repository || existing.branch !== resource.branch)
    ) {
      throw new Error(
        `Git 仓库目录冲突：${existing.repository}${existing.branch ? `#${existing.branch}` : ""} 和 ${resource.repository}${resource.branch ? `#${resource.branch}` : ""} 都会下载到 ${resource.destination}。请为其中一个配置设置不同的目录名。`,
      );
    }
    destinations.set(resource.destination, resource);
  }
  return [...destinations.values()];
}

function configuredGitResources(input: SyncProjectGitResourcesInput): ProjectGitResource[] {
  return deduplicateGitResources([
    ...configuredProjectGitResources(input),
    ...configuredKnowledgeGitResources(input),
  ]);
}

function resolveResource(input: {
  projectRoot: string;
  repository: string;
  branch?: string;
  directory?: string;
  role: "project" | "knowledge";
}): ProjectGitResource {
  const repository = input.repository.trim();
  if (!repository || repository.startsWith("-")) {
    throw new Error("Git 仓库地址无效。");
  }
  const branch = input.branch?.trim();
  if (branch?.startsWith("-")) {
    throw new Error(`Git 分支名称无效：${branch}`);
  }
  const directory = input.directory?.trim() || inferGitRepositoryDirectoryName(repository);
  if (
    !directory ||
    !SAFE_DIRECTORY_NAME.test(directory) ||
    directory === "." ||
    directory === ".."
  ) {
    throw new Error(
      `无法为 Git 仓库 ${redactRemote(repository)} 确定安全的目录名，请在 Project 配置中填写 repos 下的目录名。`,
    );
  }
  const repositoriesRoot = path.resolve(input.projectRoot, "repos");
  const destination = path.resolve(repositoriesRoot, directory);
  if (path.dirname(destination) !== repositoriesRoot) {
    throw new Error(`Git 仓库目录必须位于 ${repositoriesRoot} 下。`);
  }
  return {
    repository,
    ...(branch ? { branch } : {}),
    directory,
    destination,
    role: input.role,
  };
}

function redactRemote(remote: string): string {
  if (!/^(?:https?|ssh|git|file):\/\//u.test(remote)) return remote;
  try {
    const url = new URL(remote);
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return remote;
  }
}

async function run(runner: RunGitCommand, args: string[], cwd: string, acceptExitCodes?: number[]) {
  return runner(args, {
    cwd,
    envOverlay: GIT_ENV,
    timeout: GIT_TIMEOUT_MS,
    ...(acceptExitCodes ? { acceptExitCodes } : {}),
  });
}

async function isDirty(runner: RunGitCommand, destination: string): Promise<boolean> {
  const result = await run(runner, ["status", "--porcelain"], destination);
  return result.stdout.trim().length > 0;
}

async function refExists(
  runner: RunGitCommand,
  destination: string,
  ref: string,
): Promise<boolean> {
  const result = await run(runner, ["show-ref", "--verify", "--quiet", ref], destination, [0, 1]);
  return result.exitCode === 0;
}

async function currentBranch(runner: RunGitCommand, destination: string): Promise<string | null> {
  const result = await run(
    runner,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    destination,
    [0, 1],
  );
  return result.exitCode === 0 ? result.stdout.trim() || null : null;
}

async function updateRequestedBranch(
  runner: RunGitCommand,
  resource: ProjectGitResource,
): Promise<void> {
  const branch = resource.branch;
  if (!branch) {
    const upstream = await run(
      runner,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      resource.destination,
      [0, 128],
    );
    if (upstream.exitCode === 0 && upstream.stdout.trim()) {
      await run(runner, ["merge", "--ff-only", upstream.stdout.trim()], resource.destination);
    }
    return;
  }

  const remoteRef = `refs/remotes/origin/${branch}`;
  if (!(await refExists(runner, resource.destination, remoteRef))) {
    throw new Error(`Git 仓库 ${redactRemote(resource.repository)} 中不存在分支 ${branch}。`);
  }
  const activeBranch = await currentBranch(runner, resource.destination);
  if (activeBranch !== branch) {
    if (await isDirty(runner, resource.destination)) {
      throw new Error(
        `Git 仓库 ${resource.destination} 有未提交改动，无法从 ${activeBranch ?? "分离 HEAD"} 切换到分支 ${branch}。请先处理本地改动。`,
      );
    }
    if (await refExists(runner, resource.destination, `refs/heads/${branch}`)) {
      await run(runner, ["checkout", branch], resource.destination);
    } else {
      await run(
        runner,
        ["checkout", "-b", branch, "--track", `origin/${branch}`],
        resource.destination,
      );
    }
  }
  await run(runner, ["merge", "--ff-only", `origin/${branch}`], resource.destination);
}

async function cloneResource(
  runner: RunGitCommand,
  repositoriesRoot: string,
  resource: ProjectGitResource,
): Promise<void> {
  const staging = path.join(repositoriesRoot, `.clone-${resource.directory}-${randomUUID()}`);
  try {
    const args = ["clone"];
    if (resource.branch) {
      // Keep the normal origin fetch refspec so a later Project configuration
      // can switch branches without recloning or overwriting local work.
      args.push("--branch", resource.branch);
    }
    args.push("--", resource.repository, staging);
    await run(runner, args, repositoriesRoot);
    await run(runner, ["submodule", "update", "--init", "--recursive"], staging);
    await rename(staging, resource.destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function updateResource(runner: RunGitCommand, resource: ProjectGitResource): Promise<void> {
  await run(runner, ["rev-parse", "--is-inside-work-tree"], resource.destination);
  const origin = await run(runner, ["remote", "get-url", "origin"], resource.destination);
  if (origin.stdout.trim() !== resource.repository) {
    throw new Error(
      `Git 仓库 ${resource.destination} 的 origin 为 ${redactRemote(origin.stdout.trim())}，与配置的 ${redactRemote(resource.repository)} 不一致。为避免覆盖错误仓库，已停止任务。`,
    );
  }
  const dirty = await isDirty(runner, resource.destination);
  await run(runner, ["fetch", "--prune", "origin"], resource.destination);
  const activeBranch = await currentBranch(runner, resource.destination);
  if (dirty && (!resource.branch || activeBranch === resource.branch)) {
    return;
  }
  await updateRequestedBranch(runner, resource);
  await run(runner, ["submodule", "update", "--init", "--recursive"], resource.destination);
}

async function synchronizeResource(
  runner: RunGitCommand,
  repositoriesRoot: string,
  resource: ProjectGitResource,
): Promise<void> {
  const previous = resourceSyncs.get(resource.destination) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      if (existsSync(resource.destination)) {
        await updateResource(runner, resource);
      } else {
        await cloneResource(runner, repositoriesRoot, resource);
      }
      return undefined;
    });
  resourceSyncs.set(resource.destination, current);
  try {
    await current;
  } finally {
    if (resourceSyncs.get(resource.destination) === current) {
      resourceSyncs.delete(resource.destination);
    }
  }
}

export async function syncProjectGitResources(
  input: SyncProjectGitResourcesInput,
): Promise<ProjectGitResource[]> {
  const resources = configuredGitResources(input);
  if (resources.length === 0) return [];
  const repositoriesRoot = path.resolve(input.projectRoot, "repos");
  await mkdir(repositoriesRoot, { recursive: true });
  const runner = input.runGit ?? runGitCommand;
  for (const resource of resources) {
    try {
      await synchronizeResource(runner, repositoriesRoot, resource);
    } catch (error) {
      input.logger?.warn(
        {
          err: error,
          repository: redactRemote(resource.repository),
          destination: resource.destination,
          role: resource.role,
        },
        "Failed to synchronize Project Git resource",
      );
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `执行任务前无法同步 Git 仓库 ${redactRemote(resource.repository)}：${detail}`,
        { cause: error },
      );
    }
  }
  return resources;
}
