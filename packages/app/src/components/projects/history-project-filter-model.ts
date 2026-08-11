import type { ProjectSummary } from "@/utils/projects";

export const ALL_PROJECTS_OPTION_ID = "__all_projects__";

export function filterHistoryProjects(
  projects: readonly ProjectSummary[],
  serverId: string | null,
): ProjectSummary[] {
  if (!serverId) {
    return [...projects];
  }
  return projects.filter((project) =>
    project.hosts.some((placement) => placement.serverId === serverId),
  );
}

export function resolveHistoryProjectKeysByServerId(
  project: ProjectSummary | undefined,
  serverId: string | null,
): Record<string, string[]> | undefined {
  if (!project) {
    return undefined;
  }
  const placements = serverId
    ? project.hosts.filter((placement) => placement.serverId === serverId)
    : project.hosts;
  const keysByServerId: Record<string, string[]> = {};
  for (const placement of placements) {
    (keysByServerId[placement.serverId] ??= []).push(placement.projectId);
  }
  return Object.keys(keysByServerId).length > 0 ? keysByServerId : undefined;
}
