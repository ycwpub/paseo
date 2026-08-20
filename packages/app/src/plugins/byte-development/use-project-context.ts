import type { HostProjectListItem } from "@/projects/host-project-model";
import { getHostProjectSourceDirectory } from "@/projects/host-projects";

export function useByteDevelopmentProjectContext(input: {
  active: boolean;
  serverId: string;
  project: HostProjectListItem | null;
}) {
  const repositoryPath = input.project
    ? getHostProjectSourceDirectory(input.project, input.serverId)
    : null;
  return {
    repositoryPath,
    isLoading: false,
    error: input.active && input.project && !repositoryPath ? "Project 没有关联代码目录" : null,
  };
}
