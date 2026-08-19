export interface ByteDevelopmentProjectContext {
  projectId: string | null;
  sourceProjectId?: string | null;
  repositoryPath: string | null;
  larkDocumentLinks: readonly string[];
}

export function buildByteDevelopmentFixedFormValues(
  context: ByteDevelopmentProjectContext,
): Record<string, unknown> {
  if (!context.repositoryPath) return {};
  return {
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.sourceProjectId ? { sourceProjectId: context.sourceProjectId } : {}),
    repository_path: context.repositoryPath,
    lark_document_links: [...context.larkDocumentLinks],
  };
}
