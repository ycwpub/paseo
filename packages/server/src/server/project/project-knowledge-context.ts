import { readFileSync } from "node:fs";
import type { Logger } from "pino";
import type {
  PaseoProjectDocumentKnowledgeResource,
  PaseoProjectGeneralKnowledgeResource,
} from "@getpaseo/protocol/project-knowledge-schema";
import type { PaseoProjectConfig } from "@getpaseo/protocol/paseo-config-schema";
import type { ResolvedCloudDocument } from "../knowledge/cloud-cache/types.js";

export interface ResolvedProjectKnowledgeDocument {
  source: string;
  resolvedSource: string;
  content: string | null;
  cached?: boolean;
  error?: string | null;
}

export interface ResolvedProjectKnowledge {
  general: {
    localDocuments: string[];
    cloudDocuments: ResolvedProjectKnowledgeDocument[];
  };
  standards: {
    localDocuments: ResolvedProjectKnowledgeDocument[];
    cloudDocuments: ResolvedProjectKnowledgeDocument[];
  };
  projectSpecific: {
    localDocuments: ResolvedProjectKnowledgeDocument[];
    cloudDocuments: ResolvedProjectKnowledgeDocument[];
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

function resolveCloudDocuments(
  resources:
    | readonly PaseoProjectGeneralKnowledgeResource[]
    | readonly PaseoProjectDocumentKnowledgeResource[]
    | undefined,
  resolveCloudDocument?: (source: string) => ResolvedCloudDocument,
): ResolvedProjectKnowledgeDocument[] {
  return uniqueSources(
    enabledResources(resources)
      .filter((resource) => resource.type === "cloud-document")
      .map((resource) => resource.source),
  ).map((source) => {
    const resolved = resolveCloudDocument?.(source);
    return {
      source,
      resolvedSource: resolved?.localPath ?? source,
      content: resolved?.content ?? null,
      cached: resolved?.cached ?? false,
      error: resolved?.error ?? null,
    };
  });
}

export function resolveProjectKnowledge(input: {
  projectConfig: PaseoProjectConfig | undefined;
  resolveLocalPath: (source: string) => string;
  resolveCloudDocument?: (source: string) => ResolvedCloudDocument;
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
      cloudDocuments: resolveCloudDocuments(knowledge?.general, input.resolveCloudDocument),
    },
    standards: {
      localDocuments: readKnowledgeDocuments({
        resources: knowledge?.standards,
        resolveLocalPath: input.resolveLocalPath,
        logger: input.logger,
        projectId: input.projectId,
      }),
      cloudDocuments: resolveCloudDocuments(knowledge?.standards, input.resolveCloudDocument),
    },
    projectSpecific: {
      localDocuments: readKnowledgeDocuments({
        resources: knowledge?.projectSpecific,
        resolveLocalPath: input.resolveLocalPath,
        logger: input.logger,
        projectId: input.projectId,
      }),
      cloudDocuments: resolveCloudDocuments(knowledge?.projectSpecific, input.resolveCloudDocument),
    },
  };
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None configured";
}

function formatCloudPaths(documents: readonly ResolvedProjectKnowledgeDocument[]): string {
  if (documents.length === 0) return "- None configured";
  return documents
    .map((document) =>
      document.cached
        ? `- ${document.resolvedSource} (source: ${document.source})`
        : `- ${document.resolvedSource} (source: ${document.source}; local cache unavailable)`,
    )
    .join("\n");
}

function formatInjectedDocuments(documents: readonly ResolvedProjectKnowledgeDocument[]): string {
  if (documents.length === 0) return "- None configured";
  return documents
    .map((document) => {
      if (document.content === null) {
        return [
          `- Source: ${document.source}`,
          `  Local cache: ${document.resolvedSource}`,
          `  Status: unavailable; ${document.error ?? "the document could not be read."}`,
        ].join("\n");
      }
      return [
        `--- BEGIN PROJECT KNOWLEDGE: ${document.source} (${document.resolvedSource}) ---`,
        document.content,
        `--- END PROJECT KNOWLEDGE: ${document.source} ---`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildProjectKnowledgePrompt(input: {
  generalDirectories: readonly string[];
  knowledge: ResolvedProjectKnowledge;
}): string {
  const hasUnavailableStandard = [
    ...input.knowledge.standards.localDocuments,
    ...input.knowledge.standards.cloudDocuments,
  ].some((document) => document.content === null);
  return [
    "<paseo_project_knowledge>",
    "General knowledge is optional background material. Load it only when relevant to the current task, and adopt it only when it improves the answer or implementation.",
    "General knowledge directories:",
    formatList(input.generalDirectories),
    "General local documents:",
    formatList(input.knowledge.general.localDocuments),
    "General cloud document caches (read the local file when relevant; do not fetch the source URL):",
    formatCloudPaths(input.knowledge.general.cloudDocuments),
    "",
    "Standard knowledge is mandatory. Read every standard document before acting, obey every applicable requirement, and never knowingly violate it.",
    hasUnavailableStandard
      ? "At least one standard document is unavailable. Stop before making changes and tell the user which standard could not be read."
      : "All configured standard documents are included below.",
    "Standard local document contents:",
    formatInjectedDocuments(input.knowledge.standards.localDocuments),
    "Standard cloud document cached contents:",
    formatInjectedDocuments(input.knowledge.standards.cloudDocuments),
    "",
    "Project-specific knowledge is fully provided as Project context. Use the parts relevant to the current task; it is guidance and domain context, not a mandatory standard.",
    "Project-specific local document contents:",
    formatInjectedDocuments(input.knowledge.projectSpecific.localDocuments),
    "Project-specific cloud document cached contents:",
    formatInjectedDocuments(input.knowledge.projectSpecific.cloudDocuments),
    "</paseo_project_knowledge>",
  ].join("\n");
}
