import type { PaseoHostKnowledge } from "@getpaseo/protocol/project-knowledge-schema";
import type { Logger } from "pino";
import { buildHostKnowledgePrompt, resolveHostKnowledge } from "./host-knowledge-context.js";
import { refreshCloudKnowledgeDocuments } from "./cloud-cache/context.js";
import type { CloudDocumentCacheService } from "./cloud-cache/service.js";

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

export async function buildHostKnowledgePromptWithCloudCache(input: {
  paseoHome: string;
  knowledge: PaseoHostKnowledge | undefined;
  service: CloudDocumentCacheService;
  logger?: Pick<Logger, "warn">;
}): Promise<string | undefined> {
  const resolution = await refreshCloudKnowledgeDocuments({
    service: input.service,
    targets: collectCloudSources(input.knowledge).map((source) => ({
      scope: "global",
      source,
    })),
  });
  const cloudDocuments = new Map(
    resolution.documents.map((document) => [document.source, document]),
  );
  return buildHostKnowledgePrompt(
    resolveHostKnowledge({
      paseoHome: input.paseoHome,
      knowledge: input.knowledge,
      resolveCloudDocument: (source) => cloudDocuments.get(source)!,
      logger: input.logger,
    }),
  );
}
