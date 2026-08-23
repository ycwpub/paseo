import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import type {
  PaseoHostKnowledge,
  PaseoProjectDocumentKnowledgeResource,
  PaseoProjectGeneralKnowledgeResource,
} from "@getpaseo/protocol/project-knowledge-schema";
import type { ResolvedCloudDocument } from "./cloud-cache/types.js";

export interface ResolvedHostKnowledgeDocument {
  source: string;
  resolvedSource: string;
  content: string | null;
  cached?: boolean;
  error?: string | null;
}

export interface ResolvedHostKnowledge {
  general: {
    directories: string[];
    localDocuments: string[];
    cloudDocuments: ResolvedHostKnowledgeDocument[];
  };
  standards: {
    localDocuments: ResolvedHostKnowledgeDocument[];
    cloudDocuments: ResolvedHostKnowledgeDocument[];
  };
}

function enabledResources<
  T extends PaseoProjectGeneralKnowledgeResource | PaseoProjectDocumentKnowledgeResource,
>(resources: readonly T[] | undefined): T[] {
  return (resources ?? []).filter(
    (resource) => resource.enabled !== false && resource.source.trim().length > 0,
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function resolveHostKnowledgePath(paseoHome: string, source: string): string {
  const value = source.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith(`~${path.sep}`)) {
    return path.resolve(homedir(), value.slice(2));
  }
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(paseoHome, value);
}

function resolveCloudDocuments(
  resources:
    | readonly PaseoProjectGeneralKnowledgeResource[]
    | readonly PaseoProjectDocumentKnowledgeResource[]
    | undefined,
  resolveCloudDocument?: (source: string) => ResolvedCloudDocument,
): ResolvedHostKnowledgeDocument[] {
  return unique(
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

export function resolveHostKnowledge(input: {
  paseoHome: string;
  knowledge: PaseoHostKnowledge | undefined;
  resolveCloudDocument?: (source: string) => ResolvedCloudDocument;
  logger?: Pick<Logger, "warn">;
}): ResolvedHostKnowledge {
  const resolveLocalPath = (source: string) => resolveHostKnowledgePath(input.paseoHome, source);
  const standardDocuments = enabledResources(input.knowledge?.standards)
    .filter((resource) => resource.type === "local-document")
    .map((resource) => {
      const source = resource.source.trim();
      const resolvedSource = resolveLocalPath(source);
      try {
        return {
          source,
          resolvedSource,
          content: readFileSync(resolvedSource, "utf8"),
        };
      } catch (error) {
        input.logger?.warn(
          { err: error, source, resolvedSource },
          "Failed to read global knowledge document",
        );
        return { source, resolvedSource, content: null };
      }
    });
  return {
    general: {
      directories: unique(
        enabledResources(input.knowledge?.general)
          .filter((resource) => resource.type === "local-directory")
          .map((resource) => resolveLocalPath(resource.source)),
      ),
      localDocuments: unique(
        enabledResources(input.knowledge?.general)
          .filter((resource) => resource.type === "local-document")
          .map((resource) => resolveLocalPath(resource.source)),
      ),
      cloudDocuments: resolveCloudDocuments(input.knowledge?.general, input.resolveCloudDocument),
    },
    standards: {
      localDocuments: standardDocuments,
      cloudDocuments: resolveCloudDocuments(input.knowledge?.standards, input.resolveCloudDocument),
    },
  };
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None configured";
}

function formatCloudPaths(documents: readonly ResolvedHostKnowledgeDocument[]): string {
  if (documents.length === 0) return "- None configured";
  return documents
    .map((document) =>
      document.cached
        ? `- ${document.resolvedSource} (source: ${document.source})`
        : `- ${document.resolvedSource} (source: ${document.source}; local cache unavailable)`,
    )
    .join("\n");
}

function formatStandardDocuments(documents: readonly ResolvedHostKnowledgeDocument[]): string {
  if (documents.length === 0) return "- None configured";
  return documents
    .map((document) =>
      document.content === null
        ? [
            `- Source: ${document.source}`,
            `  Local cache: ${document.resolvedSource}`,
            `  Status: unavailable; ${document.error ?? "the document could not be read."}`,
          ].join("\n")
        : [
            `--- BEGIN GLOBAL STANDARD KNOWLEDGE: ${document.source} (${document.resolvedSource}) ---`,
            document.content,
            `--- END GLOBAL STANDARD KNOWLEDGE: ${document.source} ---`,
          ].join("\n"),
    )
    .join("\n\n");
}

export function buildHostKnowledgePrompt(knowledge: ResolvedHostKnowledge): string | undefined {
  const configured =
    knowledge.general.directories.length > 0 ||
    knowledge.general.localDocuments.length > 0 ||
    knowledge.general.cloudDocuments.length > 0 ||
    knowledge.standards.localDocuments.length > 0 ||
    knowledge.standards.cloudDocuments.length > 0;
  if (!configured) return undefined;
  const unavailableStandard = [
    ...knowledge.standards.localDocuments,
    ...knowledge.standards.cloudDocuments,
  ].some((document) => document.content === null);
  return [
    "<paseo_global_knowledge>",
    "Global general knowledge is optional background material shared by every Project and Agent managed by this Paseo instance. Read only what is relevant to the current task and adopt it only when useful.",
    "Global general knowledge is read-only by default. Modify it only when the user explicitly asks to update global knowledge in the current conversation.",
    "General knowledge directories:",
    formatList(knowledge.general.directories),
    "General local documents:",
    formatList(knowledge.general.localDocuments),
    "General cloud document caches (read the local file when relevant; do not fetch the source URL):",
    formatCloudPaths(knowledge.general.cloudDocuments),
    "",
    "Global standard knowledge is mandatory for every Agent managed by this Paseo instance. Read and obey every applicable requirement before acting.",
    unavailableStandard
      ? "At least one document in global standard knowledge is unavailable. Stop before making changes and tell the user which standard could not be read."
      : "All configured global standard documents are included below.",
    "Standard local document contents:",
    formatStandardDocuments(knowledge.standards.localDocuments),
    "Standard cloud document cached contents:",
    formatStandardDocuments(knowledge.standards.cloudDocuments),
    "</paseo_global_knowledge>",
  ].join("\n");
}
