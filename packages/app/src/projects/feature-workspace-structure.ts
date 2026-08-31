import {
  buildWorkspaceStructureProjects,
  type WorkspaceStructureHostPlacement,
  type WorkspaceStructureProject,
} from "./workspace-structure";

export interface FeatureWorkspaceStructureHostPlacement extends WorkspaceStructureHostPlacement {
  sourceDirectory?: string;
}

export interface FeatureWorkspaceStructureProject extends Omit<WorkspaceStructureProject, "hosts"> {
  hosts: FeatureWorkspaceStructureHostPlacement[];
  parentViewKey?: string | null;
}

type WorkspaceStructureInput = Parameters<typeof buildWorkspaceStructureProjects>[0];

/**
 * Enriches the stable workspace grouping model with feature-owned Project
 * hierarchy and source-directory metadata.
 */
export function buildFeatureWorkspaceStructureProjects(
  input: WorkspaceStructureInput,
): FeatureWorkspaceStructureProject[] {
  const projects = buildWorkspaceStructureProjects(input);
  const descriptorByPlacement = new Map(
    input.sessions.flatMap((session) =>
      Array.from(
        session.projects,
        (project) => [`${session.serverId}:${project.projectId}`, project] as const,
      ),
    ),
  );
  const viewKeyByPlacement = new Map(
    projects.flatMap((project) =>
      project.hosts.map((host) => [`${host.serverId}:${host.projectId}`, project.viewKey] as const),
    ),
  );

  return projects.map((project) => {
    const hosts = project.hosts.map((host) => {
      const descriptor = descriptorByPlacement.get(`${host.serverId}:${host.projectId}`);
      return Object.assign(
        {},
        host,
        descriptor?.projectSourceDirectory
          ? { sourceDirectory: descriptor.projectSourceDirectory }
          : {},
      );
    });
    const parentViewKey =
      hosts
        .map((host) => {
          const descriptor = descriptorByPlacement.get(`${host.serverId}:${host.projectId}`);
          return descriptor?.parentProjectId
            ? viewKeyByPlacement.get(`${host.serverId}:${descriptor.parentProjectId}`)
            : undefined;
        })
        .find((value): value is string => Boolean(value)) ?? null;

    return Object.assign({}, project, { hosts, parentViewKey });
  });
}
