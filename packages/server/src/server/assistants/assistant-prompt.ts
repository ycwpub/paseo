import { homedir } from "node:os";
import path from "node:path";
import type { Assistant } from "@getpaseo/protocol/messages";
import type {
  PaseoProjectDocumentKnowledgeResource,
  PaseoProjectGeneralKnowledgeResource,
} from "@getpaseo/protocol/project-knowledge-schema";
import { resolveCloudDocumentCachePaths } from "../knowledge/cloud-cache/paths.js";

function resolveAssistantMemoryOverviewPath(assistant: Assistant): string {
  if (!assistant.memoryEnabled) {
    return "";
  }
  return assistant.memoryFiles.summaryPath.trim();
}

function enabledResources<
  T extends PaseoProjectGeneralKnowledgeResource | PaseoProjectDocumentKnowledgeResource,
>(resources: readonly T[] | undefined): T[] {
  return (resources ?? []).filter(
    (resource) => resource.enabled !== false && resource.source.trim().length > 0,
  );
}

function resolveAssistantKnowledgePath(paseoHome: string, assistantId: string, source: string) {
  const value = source.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith(`~${path.sep}`)) {
    return path.resolve(homedir(), value.slice(2));
  }
  if (path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(paseoHome, "assistants", assistantId, value);
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- None configured";
}

function buildAssistantKnowledgePrompt(
  assistant: Assistant,
  paseoHome: string | undefined,
): string | undefined {
  const knowledge = assistant.knowledge;
  if (!knowledge) return undefined;
  const assistantRoot = paseoHome
    ? path.join(paseoHome, "assistants", assistant.id)
    : `~/.paseo/assistants/${assistant.id}`;
  const resolveLocalPath = (source: string) => {
    if (paseoHome) {
      return resolveAssistantKnowledgePath(paseoHome, assistant.id, source);
    }
    const trimmedSource = source.trim();
    return path.isAbsolute(trimmedSource) ? trimmedSource : path.join(assistantRoot, trimmedSource);
  };
  const general = enabledResources(knowledge.general);
  const standards = enabledResources(knowledge.standards);
  const generalDirectories = general
    .filter((resource) => resource.type === "local-directory")
    .map((resource) => resolveLocalPath(resource.source));
  const generalDocuments = general
    .filter((resource) => resource.type === "local-document")
    .map((resource) => resolveLocalPath(resource.source));
  const cloudCachePath = (source: string) =>
    paseoHome
      ? resolveCloudDocumentCachePaths(paseoHome, {
          scope: "assistant",
          assistantId: assistant.id,
          source,
        }).contentPath
      : `${assistantRoot}/knowledge/cloud-documents/<cache-for-${source}>`;
  const generalCloudDocuments = general
    .filter((resource) => resource.type === "cloud-document")
    .map((resource) => `${cloudCachePath(resource.source)} (source: ${resource.source.trim()})`);
  const standardDocuments = standards.map((resource) => {
    const source = resource.source.trim();
    const resolvedSource =
      resource.type === "cloud-document" ? cloudCachePath(source) : resolveLocalPath(source);
    return `- ${resolvedSource} (source: ${source})`;
  });
  const configured =
    generalDirectories.length > 0 ||
    generalDocuments.length > 0 ||
    generalCloudDocuments.length > 0 ||
    standardDocuments.length > 0;
  if (!configured) return undefined;
  return [
    "## Assistant knowledge",
    "Assistant general knowledge is optional background material. Read it only when relevant and adopt it only when useful.",
    "General knowledge directories:",
    formatList(generalDirectories),
    "General local documents:",
    formatList(generalDocuments),
    "General cloud document caches:",
    formatList(generalCloudDocuments),
    "",
    "Assistant standard knowledge is mandatory. Before acting, read every document below and obey every applicable requirement. If any document is unavailable, stop before making changes and tell the user which standard could not be read.",
    formatList(standardDocuments),
  ].join("\n");
}

export function buildAssistantInitialPrompt(
  assistant: Assistant,
  userPrompt: string,
  options?: { paseoHome?: string },
): string {
  const parts = [assistant.prompt.trim()];
  const knowledgePrompt = buildAssistantKnowledgePrompt(assistant, options?.paseoHome);
  if (knowledgePrompt) {
    parts.push(knowledgePrompt);
  }
  const overviewPath = resolveAssistantMemoryOverviewPath(assistant);
  if (overviewPath.length > 0) {
    parts.push(
      [
        "## Assistant memory",
        `Assistant memory overview path: ${overviewPath}`,
        "Read this overview only when the current request could benefit from prior Assistant memory. Then open only the referenced detail files needed for the task.",
      ].join("\n"),
    );
  }
  parts.push(userPrompt.trim());
  return parts.filter((part) => part.length > 0).join("\n\n---\n\n");
}
