export interface ByteDevelopmentProjectContext {
  projectId: string | null;
  repositoryPath: string | null;
}

export function buildByteDevelopmentFixedFormValues(
  context: ByteDevelopmentProjectContext,
): Record<string, unknown> {
  if (!context.repositoryPath) return {};
  return {
    ...(context.projectId ? { projectId: context.projectId } : {}),
    repository_path: context.repositoryPath,
  };
}
