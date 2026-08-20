import type {
  PaseoProjectDocumentKnowledgeResource,
  PaseoProjectGeneralKnowledgeResource,
  PaseoProjectKnowledge,
} from "@getpaseo/protocol/project-knowledge-schema";
import {
  resolvePaseoProjectDirectoryEntries,
  type PaseoProjectConfig,
} from "@getpaseo/protocol/paseo-config-schema";

export const PROJECT_KNOWLEDGE_SECTIONS = ["general", "standards", "projectSpecific"] as const;
export type ProjectKnowledgeSection = (typeof PROJECT_KNOWLEDGE_SECTIONS)[number];

export type ProjectKnowledgeResourceType = "local-directory" | "local-document" | "cloud-document";

export interface ProjectKnowledgeResourceDraft {
  id: string;
  type: ProjectKnowledgeResourceType;
  source: string;
  enabled: boolean;
  rawEntry:
    | PaseoProjectGeneralKnowledgeResource
    | PaseoProjectDocumentKnowledgeResource
    | undefined;
}

export type ProjectKnowledgeDraft = Record<
  ProjectKnowledgeSection,
  ProjectKnowledgeResourceDraft[]
>;

let knowledgeDraftId = 0;

export function createProjectKnowledgeResourceDraft(input?: {
  section?: ProjectKnowledgeSection;
  type?: ProjectKnowledgeResourceType;
  source?: string;
  enabled?: boolean;
  rawEntry?:
    | PaseoProjectGeneralKnowledgeResource
    | PaseoProjectDocumentKnowledgeResource
    | undefined;
}): ProjectKnowledgeResourceDraft {
  knowledgeDraftId += 1;
  return {
    id: `project-knowledge-${knowledgeDraftId}`,
    type: input?.type ?? (input?.section === "general" ? "local-directory" : "local-document"),
    source: input?.source ?? "",
    enabled: input?.enabled ?? true,
    rawEntry: input?.rawEntry,
  };
}

function resourceKey(resource: Pick<ProjectKnowledgeResourceDraft, "type" | "source">): string {
  return `${resource.type}\0${resource.source.trim()}`;
}

function mergeResources(
  resources: readonly ProjectKnowledgeResourceDraft[],
): ProjectKnowledgeResourceDraft[] {
  const merged = new Map<string, ProjectKnowledgeResourceDraft>();
  for (const resource of resources) {
    const source = resource.source.trim();
    if (!source) continue;
    const key = resourceKey({ ...resource, source });
    const current = merged.get(key);
    if (current) {
      current.enabled = current.enabled || resource.enabled;
      continue;
    }
    merged.set(key, { ...resource, source });
  }
  return [...merged.values()];
}

function draftResources(
  resources:
    | readonly PaseoProjectGeneralKnowledgeResource[]
    | readonly PaseoProjectDocumentKnowledgeResource[]
    | undefined,
): ProjectKnowledgeResourceDraft[] {
  return (resources ?? []).map((resource) =>
    createProjectKnowledgeResourceDraft({
      type: resource.type,
      source: resource.source,
      enabled: resource.enabled !== false,
      rawEntry: resource,
    }),
  );
}

export function projectKnowledgeToDraft(
  project: PaseoProjectConfig | null | undefined,
): ProjectKnowledgeDraft {
  const legacyDirectories = resolvePaseoProjectDirectoryEntries(project?.directories).knowledge.map(
    (entry) =>
      createProjectKnowledgeResourceDraft({
        type: "local-directory",
        source: entry.path,
        enabled: entry.enabled,
      }),
  );
  const legacyCloudDocuments = (project?.larkDocumentLinks ?? []).map((source) =>
    createProjectKnowledgeResourceDraft({
      type: "cloud-document",
      source,
    }),
  );
  return {
    general: mergeResources([
      ...draftResources(project?.knowledge?.general),
      ...legacyDirectories,
      ...legacyCloudDocuments,
    ]),
    standards: mergeResources(draftResources(project?.knowledge?.standards)),
    projectSpecific: mergeResources(draftResources(project?.knowledge?.projectSpecific)),
  };
}

function isAllowedType(
  section: ProjectKnowledgeSection,
  type: ProjectKnowledgeResourceType,
): boolean {
  return section === "general" || type !== "local-directory";
}

function resourcesToConfig(
  section: ProjectKnowledgeSection,
  resources: readonly ProjectKnowledgeResourceDraft[],
): PaseoProjectGeneralKnowledgeResource[] | PaseoProjectDocumentKnowledgeResource[] {
  return resources.flatMap((resource) => {
    const source = resource.source.trim();
    if (!source || !isAllowedType(section, resource.type)) return [];
    return [
      {
        ...resource.rawEntry,
        type: resource.type,
        source,
        enabled: resource.enabled,
      },
    ];
  });
}

export function projectKnowledgeDraftToConfig(
  draft: ProjectKnowledgeDraft,
): PaseoProjectKnowledge | undefined {
  const general = resourcesToConfig(
    "general",
    draft.general,
  ) as PaseoProjectGeneralKnowledgeResource[];
  const standards = resourcesToConfig(
    "standards",
    draft.standards,
  ) as PaseoProjectDocumentKnowledgeResource[];
  const projectSpecific = resourcesToConfig(
    "projectSpecific",
    draft.projectSpecific,
  ) as PaseoProjectDocumentKnowledgeResource[];
  if (general.length === 0 && standards.length === 0 && projectSpecific.length === 0) {
    return undefined;
  }
  return { general, standards, projectSpecific };
}

function isCloudDocumentSourceValid(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const SECTION_LABELS: Record<ProjectKnowledgeSection, string> = {
  general: "通用知识",
  standards: "规范知识",
  projectSpecific: "项目专有知识",
};

export function projectKnowledgeDraftError(draft: ProjectKnowledgeDraft): string | null {
  for (const section of PROJECT_KNOWLEDGE_SECTIONS) {
    const resources = draft[section];
    for (const [index, resource] of resources.entries()) {
      const prefix = `${SECTION_LABELS[section]}第 ${index + 1} 项`;
      if (!isAllowedType(section, resource.type)) {
        return `${prefix}不支持本地目录`;
      }
      if (!resource.source.trim()) {
        return `${prefix}缺少路径或链接`;
      }
      if (resource.type === "cloud-document" && !isCloudDocumentSourceValid(resource.source)) {
        return `${prefix}不是有效的 HTTP/HTTPS 云文档链接`;
      }
    }
  }
  return null;
}
