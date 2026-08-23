import type { PaseoHostKnowledge } from "@getpaseo/protocol/project-knowledge-schema";
import type { Logger } from "pino";
import type { ProjectRegistry, WorkspaceRegistry } from "../../workspace-registry.js";
import { refreshCloudKnowledgeDocuments } from "../../knowledge/cloud-cache/context.js";
import type { CloudDocumentCacheService } from "../../knowledge/cloud-cache/service.js";
import type {
  CloudDocumentAuthenticationIssue,
  CloudDocumentCacheTarget,
} from "../../knowledge/cloud-cache/types.js";
import { withProjectAgentContext } from "../../project/project-context.js";
import type { AgentSessionConfig } from "../agent-sdk-types.js";

export interface AgentCloudKnowledgeAuthorizationRequest {
  target: CloudDocumentCacheTarget;
  issue: CloudDocumentAuthenticationIssue;
}

interface PrepareAgentCloudKnowledgeInput {
  config: AgentSessionConfig;
  workspaceId?: string;
  paseoHome?: string;
  service?: CloudDocumentCacheService;
  readGlobalKnowledge?: () => PaseoHostKnowledge | undefined;
  projectRegistry?: Pick<ProjectRegistry, "get">;
  workspaceRegistry?: Pick<WorkspaceRegistry, "get">;
  logger: Logger;
}

function collectCloudSources(knowledge: PaseoHostKnowledge | undefined): string[] {
  return Array.from(
    new Set(
      [...(knowledge?.general ?? []), ...(knowledge?.standards ?? [])]
        .filter(
          (resource) =>
            resource.enabled !== false &&
            resource.type === "cloud-document" &&
            resource.source.trim(),
        )
        .map((resource) => resource.source.trim()),
    ),
  );
}

async function resolveGlobalAuthorizationRequests(
  input: PrepareAgentCloudKnowledgeInput,
): Promise<AgentCloudKnowledgeAuthorizationRequest[]> {
  if (!input.service || !input.readGlobalKnowledge) return [];
  const sources = collectCloudSources(input.readGlobalKnowledge());
  const resolution = await refreshCloudKnowledgeDocuments({
    service: input.service,
    targets: sources.map((source) => ({ scope: "global", source })),
  });
  return resolution.authIssues.map((issue) => ({
    target: { scope: "global", source: issue.source },
    issue,
  }));
}

async function resolveProjectContext(input: PrepareAgentCloudKnowledgeInput): Promise<{
  config: AgentSessionConfig;
  authorizationRequests: AgentCloudKnowledgeAuthorizationRequest[];
}> {
  if (!input.workspaceId || !input.projectRegistry || !input.workspaceRegistry) {
    return { config: input.config, authorizationRequests: [] };
  }
  const workspace = await input.workspaceRegistry.get(input.workspaceId);
  const projectId = workspace?.projectId;
  const authorizationRequests: AgentCloudKnowledgeAuthorizationRequest[] = [];
  const config = await withProjectAgentContext({
    config: input.config,
    workspaceId: input.workspaceId,
    projectRegistry: input.projectRegistry,
    workspaceRegistry: input.workspaceRegistry,
    paseoHome: input.paseoHome,
    cloudDocumentCacheService: input.service,
    onAuthIssues: (issues) => {
      if (!projectId) return;
      for (const issue of issues) {
        authorizationRequests.push({
          target: { scope: "project", projectId, source: issue.source },
          issue,
        });
      }
    },
    logger: input.logger,
  });
  return { config, authorizationRequests };
}

export async function prepareAgentCloudKnowledge(input: PrepareAgentCloudKnowledgeInput): Promise<{
  config: AgentSessionConfig;
  authorizationRequests: AgentCloudKnowledgeAuthorizationRequest[];
}> {
  const [globalAuthorizationRequests, projectContext] = await Promise.all([
    resolveGlobalAuthorizationRequests(input),
    resolveProjectContext(input),
  ]);
  return {
    config: projectContext.config,
    authorizationRequests: [
      ...globalAuthorizationRequests,
      ...projectContext.authorizationRequests,
    ],
  };
}
