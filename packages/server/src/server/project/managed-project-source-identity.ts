import path from "node:path";

import { isGeneratedProjectId } from "./project-id.js";

export function getManagedProjectIdForSourceDirectory(
  paseoHome: string,
  directory: string,
): string | null {
  const resolvedDirectory = path.resolve(directory);
  const managedProjectsRoot = path.resolve(paseoHome, "projects");
  if (path.dirname(resolvedDirectory) !== managedProjectsRoot) {
    return null;
  }

  const projectId = path.basename(resolvedDirectory);
  return isGeneratedProjectId(projectId) ? projectId : null;
}
