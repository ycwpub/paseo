export interface ByteDevelopmentProjectContext {
  projectId: string | null;
  repositoryPath: string | null;
  larkDocumentLinks: readonly string[];
}

export function buildByteDevelopmentFixedFormValues(
  context: ByteDevelopmentProjectContext,
): Record<string, unknown> {
  if (!context.projectId || !context.repositoryPath) return {};
  return {
    projectId: context.projectId,
    repository_path: context.repositoryPath,
    lark_document_links: [...context.larkDocumentLinks],
  };
}
