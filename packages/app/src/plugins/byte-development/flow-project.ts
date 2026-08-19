import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";

export interface DevelopmentProjectClient {
  createDirectorylessProject(input: { name: string }): Promise<{
    project: WorkspaceProjectDescriptorPayload | null;
    error: string | null;
  }>;
}

export function developmentProjectName(flowTitle: unknown): string {
  const title = typeof flowTitle === "string" ? flowTitle.trim() : "";
  return (title ? `研发流程 · ${title}` : "研发流程").slice(0, 120);
}

export async function createDevelopmentProject(input: {
  client: DevelopmentProjectClient;
  flowTitle: unknown;
}): Promise<WorkspaceProjectDescriptorPayload> {
  const result = await input.client.createDirectorylessProject({
    name: developmentProjectName(input.flowTitle),
  });
  if (result.error || !result.project) {
    throw new Error(result.error ?? "无法为开发流程创建独立 Project");
  }
  return result.project;
}
