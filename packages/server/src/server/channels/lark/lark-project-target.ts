import path from "node:path";
import type { LarkChannelTarget } from "@getpaseo/protocol/messages";

const MANAGED_PROJECT_ID_PATTERN = /^prj_[0-9a-f]{16}$/;

export function resolveLarkTargetProjectId(
  target: LarkChannelTarget,
  paseoHome: string,
): string | undefined {
  const explicitProjectId = target.projectId?.trim();
  if (explicitProjectId) return explicitProjectId;

  const cwd = target.cwd?.trim();
  if (!cwd) return undefined;

  // COMPAT(larkTargetProject): added in v0.7.0, remove after 2027-03-08 once
  // persisted Lark bot and substitute targets always include projectId.
  const resolvedCwd = path.resolve(cwd);
  const managedProjectsRoot = path.resolve(paseoHome, "projects");
  if (path.dirname(resolvedCwd) !== managedProjectsRoot) return undefined;
  const projectId = path.basename(resolvedCwd);
  return MANAGED_PROJECT_ID_PATTERN.test(projectId) ? projectId : undefined;
}
