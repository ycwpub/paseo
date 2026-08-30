export function isGeneratedProjectId(projectId: string): boolean {
  return /^prj_[0-9a-f]{16}$/.test(projectId);
}
