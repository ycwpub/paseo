import {
  addProjectMethodEmptyText,
  buildCloneLocationOptions,
  buildAddProjectMethods as buildBaseAddProjectMethods,
  buildManualGithubRepositoryChoices,
  buildSuggestedParentDirectories,
  filterAddProjectHosts,
  joinDirectoryPath,
  pathBaseName,
  type AddProjectMethodOption as BaseAddProjectMethodOption,
} from "./options";
import type { AddProjectHost } from "./directoryless-project-model";

export type AddProjectMethodId =
  | BaseAddProjectMethodOption["id"]
  | "directoryless-project";

export interface AddProjectMethodOption
  extends Omit<BaseAddProjectMethodOption, "id"> {
  id: AddProjectMethodId;
}

export function buildAddProjectMethods(
  host: AddProjectHost
): AddProjectMethodOption[] {
  const options: AddProjectMethodOption[] = [
    ...buildBaseAddProjectMethods(host),
  ];
  if (!host.canAddProject) return options;
  options.push({
    id: "directoryless-project",
    label: "Multi-directory project",
    description: host.canCreateDirectorylessProject
      ? `Create a project with configurable directories on ${host.label}`
      : "Update this host to create multi-directory projects",
    disabled: !host.canCreateDirectorylessProject,
  });
  return options;
}

export {
  addProjectMethodEmptyText,
  buildCloneLocationOptions,
  buildManualGithubRepositoryChoices,
  buildSuggestedParentDirectories,
  filterAddProjectHosts,
  joinDirectoryPath,
  pathBaseName,
};
