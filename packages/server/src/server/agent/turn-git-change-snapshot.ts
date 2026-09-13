import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentTurnChangeFile, AgentTurnChangesSnapshot } from "@getpaseo/protocol/agent-types";
import { createRunGitCommand, type RunGitCommand } from "../../utils/run-git-command.js";

const runSnapshotGitCommand = createRunGitCommand("agent-turn-git-snapshot");

export interface TurnGitRepositoryBaseline {
  cwd: string;
  tree: string;
}

export interface TurnGitBaseline {
  repositories: TurnGitRepositoryBaseline[];
}

export interface CaptureTurnGitBaselineInput {
  cwd: string;
  writableProjectDirectories?: readonly string[];
  runGitCommand?: RunGitCommand;
}

export interface TurnGitChangeCapture {
  captureBaseline(input: CaptureTurnGitBaselineInput): Promise<TurnGitBaseline>;
  captureChanges(baseline: TurnGitBaseline): Promise<AgentTurnChangesSnapshot>;
}

function normalizePath(value: string): string {
  return path.resolve(value);
}

async function tryResolveRepositoryRoot(
  cwd: string,
  runGitCommand: RunGitCommand,
): Promise<string | null> {
  try {
    const { stdout } = await runGitCommand(["rev-parse", "--show-toplevel"], {
      cwd,
      envOverlay: { GIT_OPTIONAL_LOCKS: "0" },
    });
    const repositoryRoot = stdout.trim();
    return repositoryRoot ? normalizePath(repositoryRoot) : null;
  } catch {
    return null;
  }
}

async function listManagedRepositoryCandidates(directory: string): Promise<string[]> {
  const reposDirectory = path.join(directory, "repos");
  try {
    const entries = await readdir(reposDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(reposDirectory, entry.name));
  } catch {
    return [];
  }
}

async function discoverRepositoryRoots(
  input: CaptureTurnGitBaselineInput,
  runGitCommand: RunGitCommand,
): Promise<string[]> {
  const roots = new Set<string>();
  const candidates = Array.from(
    new Set(
      [input.cwd, ...(input.writableProjectDirectories ?? [])]
        .map((directory) => directory.trim())
        .filter(Boolean)
        .map(normalizePath),
    ),
  );

  for (const candidate of candidates) {
    const directRoot = await tryResolveRepositoryRoot(candidate, runGitCommand);
    if (directRoot) {
      roots.add(directRoot);
      continue;
    }
    for (const managedCandidate of await listManagedRepositoryCandidates(candidate)) {
      const managedRoot = await tryResolveRepositoryRoot(managedCandidate, runGitCommand);
      if (managedRoot) {
        roots.add(managedRoot);
      }
    }
  }

  return [...roots].sort();
}

async function createWorkingTreeObject(cwd: string, runGitCommand: RunGitCommand): Promise<string> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "paseo-turn-git-index-"));
  const indexPath = path.join(temporaryDirectory, "index");
  const envOverlay = {
    GIT_INDEX_FILE: indexPath,
    GIT_OPTIONAL_LOCKS: "0",
  };
  try {
    try {
      await runGitCommand(["read-tree", "HEAD"], { cwd, envOverlay });
    } catch {
      await runGitCommand(["read-tree", "--empty"], { cwd, envOverlay });
    }
    await runGitCommand(["add", "-A", "--", "."], { cwd, envOverlay });
    const { stdout } = await runGitCommand(["write-tree"], { cwd, envOverlay });
    const tree = stdout.trim();
    if (!tree) {
      throw new Error(`Git did not return a tree object for ${cwd}`);
    }
    return tree;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

function parseNameStatus(
  output: string,
): Map<string, Omit<AgentTurnChangeFile, "additions" | "deletions">> {
  const changes = new Map<string, Omit<AgentTurnChangeFile, "additions" | "deletions">>();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [status = "", firstPath, secondPath] = line.split("\t");
    const code = status[0];
    const filePath = code === "R" || code === "C" ? secondPath : firstPath;
    if (!filePath) continue;
    changes.set(filePath, {
      path: filePath,
      ...(secondPath && firstPath ? { oldPath: firstPath } : {}),
      isNew: code === "A",
      isDeleted: code === "D",
    });
  }
  return changes;
}

function parseNumstat(output: string): Map<string, { additions: number; deletions: number }> {
  const stats = new Map<string, { additions: number; deletions: number }>();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [additionsText = "", deletionsText = "", ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    if (!filePath) continue;
    const additions = Number.parseInt(additionsText, 10);
    const deletions = Number.parseInt(deletionsText, 10);
    stats.set(filePath, {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    });
  }
  return stats;
}

async function compareTrees(input: {
  cwd: string;
  baselineTree: string;
  currentTree: string;
  runGitCommand: RunGitCommand;
}): Promise<AgentTurnChangeFile[]> {
  const [nameStatus, numstat] = await Promise.all([
    input.runGitCommand(
      ["diff", "--no-renames", "--name-status", input.baselineTree, input.currentTree],
      { cwd: input.cwd, envOverlay: { GIT_OPTIONAL_LOCKS: "0" } },
    ),
    input.runGitCommand(
      ["diff", "--no-renames", "--numstat", input.baselineTree, input.currentTree],
      { cwd: input.cwd, envOverlay: { GIT_OPTIONAL_LOCKS: "0" } },
    ),
  ]);
  const changes = parseNameStatus(nameStatus.stdout);
  const stats = parseNumstat(numstat.stdout);
  const files: AgentTurnChangeFile[] = [];
  for (const change of changes.values()) {
    files.push({
      path: change.path,
      ...(change.oldPath ? { oldPath: change.oldPath } : {}),
      isNew: change.isNew,
      isDeleted: change.isDeleted,
      additions: stats.get(change.path)?.additions ?? 0,
      deletions: stats.get(change.path)?.deletions ?? 0,
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function captureTurnGitBaseline(
  input: CaptureTurnGitBaselineInput,
): Promise<TurnGitBaseline> {
  const runGitCommand = input.runGitCommand ?? runSnapshotGitCommand;
  const repositoryRoots = await discoverRepositoryRoots(input, runGitCommand);
  const repositories: TurnGitRepositoryBaseline[] = [];
  for (const cwd of repositoryRoots) {
    repositories.push({
      cwd,
      tree: await createWorkingTreeObject(cwd, runGitCommand),
    });
  }
  return { repositories };
}

export async function captureTurnGitChanges(
  baseline: TurnGitBaseline,
  options?: { runGitCommand?: RunGitCommand },
): Promise<AgentTurnChangesSnapshot> {
  const runGitCommand = options?.runGitCommand ?? runSnapshotGitCommand;
  const repositories: AgentTurnChangesSnapshot["repositories"] = [];
  for (const repository of baseline.repositories) {
    const currentTree = await createWorkingTreeObject(repository.cwd, runGitCommand);
    const files = await compareTrees({
      cwd: repository.cwd,
      baselineTree: repository.tree,
      currentTree,
      runGitCommand,
    });
    if (files.length > 0) {
      repositories.push({ cwd: repository.cwd, files });
    }
  }
  return { repositories };
}

export const defaultTurnGitChangeCapture: TurnGitChangeCapture = {
  captureBaseline: captureTurnGitBaseline,
  captureChanges: captureTurnGitChanges,
};
