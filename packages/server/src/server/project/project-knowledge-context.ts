import { readFileSync } from "node:fs";
import type { Logger } from "pino";
import type {
  PaseoProjectDocumentKnowledgeResource,
  PaseoProjectGeneralKnowledgeResource,
} from "@getpaseo/protocol/project-knowledge-schema";
import type { PaseoProjectConfig } from "@getpaseo/protocol/paseo-config-schema";

export interface ResolvedProjectKnowledgeDocument {
  source: string;
  resolvedSource: string;
  content: string | null;
}

export interface ResolvedProjectKnowledge {
  general: {
    localDocuments: string[];
    cloudDocuments: string[];
  };
  standards: {
    localDocuments: ResolvedProjectKnowledgeDocument[];
    cloudDocuments: string[];
  };
  projectSpecific: {
    localDocuments: ResolvedProjectKnowledgeDocument[];
    cloudDocuments: string[];
  };
}

export const EMPTY_PROJECT_KNOWLEDGE: ResolvedProjectKnowledge = {
  general: {
    localDocuments: [],
    cloudDocuments: [],
  },
  standards: {
    localDocuments: [],
    cloudDocuments: [],
  },
  projectSpecific: {
    localDocuments: [],
    cloudDocuments: [],
  },
};

function enabledResources<
  T extends PaseoProjectGeneralKnowledgeResource | PaseoProjectDocumentKnowledgeResource,
>(resources: readonly T[] | undefined): T[] {
  return (resources ?? []).filter(
    (resource) => resource.enabled !== false && resource.source.trim(),
  );
}

function uniqueSources(sources: readonly string[]): string[] {
  return [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
}

function readKnowledgeDocuments(input: {
  resources: readonly PaseoProjectDocumentKnowledgeResource[] | undefined;
  resolveLocalPath: (source: string) => string;
  logger?: Pick<Logger, "warn">;
  projectId?: string;
}): ResolvedProjectKnowledgeDocument[] {
  return enabledResources(input.resources)
    .filter((resource) => resource.type === "local-document")
    .map((resource) => {
      const source = resource.source.trim();
      const resolvedSource = input.resolveLocalPath(source);
      try {
        return {
          source,
          resolvedSource,
          content: readFileSync(resolvedSource, "utf8"),
        };
      } catch (error) {
        input.logger?.warn(
          { err: error, projectId: input.projectId, source, resolvedSource },
          "Failed to read Project knowledge document",
        );
        return { source, resolvedSource, content: null };
      }
    });
}

function cloudDocumentSources(
  resources:
    | readonly PaseoProjectGeneralKnowledgeResource[]
    | readonly PaseoProjectDocumentKnowledgeResource[]
    | undefined,
): string[] {
  return uniqueSources(
    enabledResources(resources)
      .filter((resource) => resource.type === "cloud-document")
      .map((resource) => resource.source),
  );
}

export function resolveProjectKnowledge(input: {
  projectConfig: PaseoProjectConfig | undefined;
  resolveLocalPath: (source: string) => string;
  logger?: Pick<Logger, "warn">;
  projectId?: string;
}): ResolvedProjectKnowledge {
  const knowledge = input.projectConfig?.knowledge;
  return {
    general: {
      localDocuments: uniqueSources(
        enabledResources(knowledge?.general)
          .filter((resource) => resource.type === "local-document")
          .map((resource) => input.resolveLocalPath(resource.source)),
      ),
      cloudDocuments: cloudDocumentSources(knowledge?.general),
    },
    standards: {
      localDocuments: readKnowledgeDocuments({
        resources: knowledge?.standards,
        resolveLocalPath: input.resolveLocalPath,
        logger: input.logger,
        projectId: input.projectId,
      }),
      cloudDocuments: cloudDocumentSources(knowledge?.standards),
    },
    projectSpecific: {
      localDocuments: readKnowledgeDocuments({
        resources: knowledge?.projectSpecific,
        resolveLocalPath: input.resolveLocalPath,
        logger: input.logger,
        projectId: input.projectId,
      }),
      cloudDocuments: cloudDocumentSources(knowledge?.projectSpecific),
    },
  };
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None configured";
}

function formatInjectedDocuments(documents: readonly ResolvedProjectKnowledgeDocument[]): string {
  if (documents.length === 0) return "- None configured";
  return documents
    .map((document) => {
      if (document.content === null) {
        return [
          `- Source: ${document.resolvedSource}`,
          "  Status: unavailable; the document could not be read.",
        ].join("\n");
      }
      return [
        `--- BEGIN PROJECT KNOWLEDGE: ${document.resolvedSource} ---`,
        document.content,
        `--- END PROJECT KNOWLEDGE: ${document.resolvedSource} ---`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildProjectKnowledgePrompt(input: {
  generalDirectories: readonly string[];
  knowledge: ResolvedProjectKnowledge;
}): string {
  const hasUnavailableStandard = input.knowledge.standards.localDocuments.some(
    (document) => document.content === null,
  );
  return [
    "<paseo_project_knowledge>",
    "General knowledge is optional background material. Load it only when relevant to the current task, and adopt it only when it improves the answer or implementation.",
    "General knowledge directories:",
    formatList(input.generalDirectories),
    "General local documents:",
    formatList(input.knowledge.general.localDocuments),
    "General cloud documents:",
    formatList(input.knowledge.general.cloudDocuments),
    "",
    "Standard knowledge is mandatory. Read every standard document before acting, obey every applicable requirement, and never knowingly violate it.",
    hasUnavailableStandard
      ? "At least one local standard document is unavailable. Stop before making changes and tell the user which standard could not be read."
      : "All configured local standard documents are included below.",
    input.knowledge.standards.cloudDocuments.length > 0
      ? "You MUST open and read every standard cloud document before acting. If a document cannot be loaded, stop and tell the user."
      : "No standard cloud document is configured.",
    "Standard cloud documents:",
    formatList(input.knowledge.standards.cloudDocuments),
    "Standard local document contents:",
    formatInjectedDocuments(input.knowledge.standards.localDocuments),
    "",
    "Project-specific knowledge is fully provided as Project context. Use the parts relevant to the current task; it is guidance and domain context, not a mandatory standard.",
    input.knowledge.projectSpecific.cloudDocuments.length > 0
      ? "Open the project-specific cloud documents when their content is relevant to the task."
      : "No project-specific cloud document is configured.",
    "Project-specific cloud documents:",
    formatList(input.knowledge.projectSpecific.cloudDocuments),
    "Project-specific local document contents:",
    formatInjectedDocuments(input.knowledge.projectSpecific.localDocuments),
    "</paseo_project_knowledge>",
  ].join("\n");
}
