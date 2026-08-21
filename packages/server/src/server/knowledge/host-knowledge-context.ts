import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import type {
  PaseoHostKnowledge,
  PaseoProjectDocumentKnowledgeResource,
  PaseoProjectGeneralKnowledgeResource,
} from "@getpaseo/protocol/project-knowledge-schema";

export interface ResolvedHostKnowledgeDocument {
  source: string;
  resolvedSource: string;
  content: string | null;
}

export interface ResolvedHostKnowledge {
  general: {
    directories: string[];
    localDocuments: string[];
    cloudDocuments: string[];
  };
  standards: {
    localDocuments: ResolvedHostKnowledgeDocument[];
    cloudDocuments: string[];
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

function cloudSources(
  resources:
    | readonly PaseoProjectGeneralKnowledgeResource[]
    | readonly PaseoProjectDocumentKnowledgeResource[]
    | undefined,
): string[] {
  return unique(
    enabledResources(resources)
      .filter((resource) => resource.type === "cloud-document")
      .map((resource) => resource.source),
  );
}

export function resolveHostKnowledge(input: {
  paseoHome: string;
  knowledge: PaseoHostKnowledge | undefined;
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
          "Failed to read Host knowledge document",
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
      cloudDocuments: cloudSources(input.knowledge?.general),
    },
    standards: {
      localDocuments: standardDocuments,
      cloudDocuments: cloudSources(input.knowledge?.standards),
    },
  };
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None configured";
}

function formatStandardDocuments(documents: readonly ResolvedHostKnowledgeDocument[]): string {
  if (documents.length === 0) return "- None configured";
  return documents
    .map((document) =>
      document.content === null
        ? [
            `- Source: ${document.resolvedSource}`,
            "  Status: unavailable; the document could not be read.",
          ].join("\n")
        : [
            `--- BEGIN HOST STANDARD KNOWLEDGE: ${document.resolvedSource} ---`,
            document.content,
            `--- END HOST STANDARD KNOWLEDGE: ${document.resolvedSource} ---`,
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
  const unavailableStandard = knowledge.standards.localDocuments.some(
    (document) => document.content === null,
  );
  return [
    "<paseo_host_knowledge>",
    "Host general knowledge is optional background material shared by every Project on this Host. Read only what is relevant to the current task and adopt it only when useful.",
    "Host general knowledge is read-only by default. Modify it only when the user explicitly asks to update Host knowledge in the current conversation.",
    "General knowledge directories:",
    formatList(knowledge.general.directories),
    "General local documents:",
    formatList(knowledge.general.localDocuments),
    "General cloud documents:",
    formatList(knowledge.general.cloudDocuments),
    "",
    "Host standard knowledge is mandatory for every Agent on this Host. Read and obey every applicable requirement before acting.",
    unavailableStandard
      ? "At least one local Host standard is unavailable. Stop before making changes and tell the user which standard could not be read."
      : "All configured local Host standards are included below.",
    knowledge.standards.cloudDocuments.length > 0
      ? "You MUST open and read every Host standard cloud document before acting. If a document cannot be loaded, stop and tell the user."
      : "No Host standard cloud document is configured.",
    "Standard cloud documents:",
    formatList(knowledge.standards.cloudDocuments),
    "Standard local document contents:",
    formatStandardDocuments(knowledge.standards.localDocuments),
    "</paseo_host_knowledge>",
  ].join("\n");
}
