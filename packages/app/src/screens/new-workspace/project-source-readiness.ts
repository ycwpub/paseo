import {
  getHostProjectId,
  getHostProjectSourceDirectory,
  type HostProjectListItem,
} from "@/projects/host-projects";

export type ProjectSourceReadiness =
  | { kind: "ready"; projectId: string; sourceDirectory: string }
  | { kind: "missing_host" }
  | { kind: "missing_directory"; projectId: string };

export function resolveProjectSourceReadiness(input: {
  project: HostProjectListItem;
  serverId: string;
}): ProjectSourceReadiness {
  const projectId = getHostProjectId(input.project, input.serverId);
  if (!projectId) {
    return { kind: "missing_host" };
  }
  const sourceDirectory = getHostProjectSourceDirectory(input.project, input.serverId);
  if (!sourceDirectory) {
    return { kind: "missing_directory", projectId };
  }
  return { kind: "ready", projectId, sourceDirectory };
}
