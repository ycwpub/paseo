import type { PersistedProjectRecord, ProjectRegistry } from "../workspace-registry.js";
import type { CloudDocumentAuthenticationIssue } from "../knowledge/cloud-cache/types.js";
import type { ResolvedProjectKnowledge } from "./project-knowledge-context.js";

const MAX_PROJECT_HIERARCHY_DEPTH = 32;

export interface ResolvedParentProjectKnowledge {
  knowledgeDirectories: string[];
  knowledgeLayers: ResolvedProjectKnowledge[];
  authIssues: CloudDocumentAuthenticationIssue[];
}

interface ParentProjectKnowledgeLayer {
  knowledgeDirectories: readonly string[];
  knowledge: ResolvedProjectKnowledge;
  authIssues: readonly CloudDocumentAuthenticationIssue[];
}

export async function loadParentProjectKnowledge(input: {
  project: PersistedProjectRecord;
  projectRegistry: Pick<ProjectRegistry, "get">;
  resolveLayer: (project: PersistedProjectRecord) => Promise<ParentProjectKnowledgeLayer>;
}): Promise<ResolvedParentProjectKnowledge> {
  const ancestors = await collectParentProjects(input.project, input.projectRegistry);
  const knowledgeDirectories: string[] = [];
  const knowledgeLayers: ResolvedProjectKnowledge[] = [];
  const authIssues: CloudDocumentAuthenticationIssue[] = [];

  for (const ancestor of ancestors) {
    const layer = await input.resolveLayer(ancestor);
    knowledgeDirectories.push(...layer.knowledgeDirectories);
    knowledgeLayers.push(layer.knowledge);
    authIssues.push(...layer.authIssues);
  }

  return { knowledgeDirectories, knowledgeLayers, authIssues };
}

async function collectParentProjects(
  project: PersistedProjectRecord,
  projectRegistry: Pick<ProjectRegistry, "get">,
): Promise<PersistedProjectRecord[]> {
  const ancestors: PersistedProjectRecord[] = [];
  const visitedProjectIds = new Set([project.projectId]);
  let parentProjectId = project.parentProjectId;

  while (
    parentProjectId &&
    ancestors.length < MAX_PROJECT_HIERARCHY_DEPTH &&
    !visitedProjectIds.has(parentProjectId)
  ) {
    visitedProjectIds.add(parentProjectId);
    const parent = await projectRegistry.get(parentProjectId);
    if (!parent || parent.archivedAt) break;
    ancestors.unshift(parent);
    parentProjectId = parent.parentProjectId;
  }

  return ancestors;
}
