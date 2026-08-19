import type { Logger } from "pino";
import type { PaseoProjectConfig } from "@getpaseo/protocol/paseo-config-schema";
import {
  readCachedCloudKnowledgeDocument,
  refreshCloudKnowledgeDocuments,
} from "../knowledge/cloud-cache/context.js";
import type { CloudDocumentCacheService } from "../knowledge/cloud-cache/service.js";
import type { CloudDocumentAuthenticationIssue } from "../knowledge/cloud-cache/types.js";
import {
  resolveProjectKnowledge,
  type ResolvedProjectKnowledge,
} from "./project-knowledge-context.js";

interface ResolveProjectKnowledgeWithCloudCacheInput {
  projectConfig: PaseoProjectConfig | undefined;
  projectId: string;
  paseoHome?: string;
  service?: CloudDocumentCacheService;
  resolveLocalPath: (source: string) => string;
  logger?: Pick<Logger, "warn">;
}

function collectCloudSources(projectConfig: PaseoProjectConfig | undefined): string[] {
  return Array.from(
    new Set(
      [
        ...(projectConfig?.knowledge?.general ?? []),
        ...(projectConfig?.knowledge?.standards ?? []),
        ...(projectConfig?.knowledge?.projectSpecific ?? []),
      ]
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

export async function resolveProjectKnowledgeWithCloudCache(
  input: ResolveProjectKnowledgeWithCloudCacheInput,
): Promise<{
  knowledge: ResolvedProjectKnowledge;
  authIssues: CloudDocumentAuthenticationIssue[];
}> {
  const sources = collectCloudSources(input.projectConfig);
  const resolution =
    input.paseoHome && input.service
      ? await refreshCloudKnowledgeDocuments({
          service: input.service,
          targets: sources.map((source) => ({
            scope: "project",
            projectId: input.projectId,
            source,
          })),
        })
      : { documents: [], authIssues: [] };
  const refreshedDocuments = new Map(
    resolution.documents.map((document) => [document.source, document]),
  );
  const paseoHome = input.paseoHome;
  const resolveCloudDocument = paseoHome
    ? (source: string) =>
        refreshedDocuments.get(source) ??
        readCachedCloudKnowledgeDocument({
          paseoHome,
          target: { scope: "project", projectId: input.projectId, source },
        })
    : undefined;
  return {
    knowledge: resolveProjectKnowledge({
      projectConfig: input.projectConfig,
      projectId: input.projectId,
      logger: input.logger,
      resolveLocalPath: input.resolveLocalPath,
      resolveCloudDocument,
    }),
    authIssues: resolution.authIssues,
  };
}
