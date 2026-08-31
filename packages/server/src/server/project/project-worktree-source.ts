import { expandTilde } from "../../utils/path.js";
import { requireProjectDirectory } from "./project-directory-backing.js";
import type { ProjectRegistry } from "../workspace-registry.js";
import type { WorktreeWorkspaceSource } from "../workspace-source.js";

export async function resolveProjectWorktreeSourceCwd(
  source: WorktreeWorkspaceSource,
  projectRegistry: Pick<ProjectRegistry, "get">,
): Promise<string> {
  if (source.cwd) return expandTilde(source.cwd);
  if (!source.projectId) {
    throw new Error("cwd or projectId is required for a worktree-backed workspace");
  }

  const project = await projectRegistry.get(source.projectId);
  if (!project || project.archivedAt) {
    throw new Error(`Project not found: ${source.projectId}`);
  }
  return requireProjectDirectory(project, "Worktree creation");
}
