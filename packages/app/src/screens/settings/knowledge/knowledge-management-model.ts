import type { PaseoConfigRaw } from "@getpaseo/protocol/messages";
import {
  projectKnowledgeDraftToConfig,
  type ProjectKnowledgeDraft,
} from "@/projects/knowledge/model";
import type { ProjectSummary } from "@/utils/projects";

export interface KnowledgeProjectTarget {
  projectId: string;
  label: string;
  description: string;
  repoRoot: string;
  isDirectoryless: boolean;
  isOnline: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildKnowledgeProjectTargets(
  projects: readonly ProjectSummary[],
  serverId: string,
): KnowledgeProjectTarget[] {
  const targets = new Map<string, KnowledgeProjectTarget>();
  for (const project of projects) {
    for (const host of project.hosts) {
      if (host.serverId !== serverId || targets.has(host.projectId)) continue;
      targets.set(host.projectId, {
        projectId: host.projectId,
        label: host.projectCustomName?.trim() || host.projectName,
        description: host.repoRoot.trim() || host.projectPath,
        repoRoot: host.repoRoot,
        isDirectoryless: host.isDirectoryless,
        isOnline: host.isOnline,
      });
    }
  }
  return [...targets.values()].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { numeric: true }),
  );
}

export function applyProjectKnowledgeToConfig(
  config: PaseoConfigRaw,
  draft: ProjectKnowledgeDraft,
): PaseoConfigRaw {
  const nextConfig = { ...config } as Record<string, unknown>;
  const nextProject = { ...asRecord(config.project) };

  // Canonical knowledge management replaces the legacy locations that are
  // still accepted when reading older paseo.json files.
  delete nextProject.larkDocumentLinks;
  const nextDirectories = { ...asRecord(nextProject.directories) };
  delete nextDirectories.reference;
  delete nextDirectories.knowledge;
  if (Object.keys(nextDirectories).length > 0) {
    nextProject.directories = nextDirectories;
  } else {
    delete nextProject.directories;
  }

  const nextKnowledge = { ...asRecord(nextProject.knowledge) };
  delete nextKnowledge.general;
  delete nextKnowledge.standards;
  delete nextKnowledge.projectSpecific;
  const managedKnowledge = projectKnowledgeDraftToConfig(draft);
  if (managedKnowledge) {
    Object.assign(nextKnowledge, managedKnowledge);
  }
  if (Object.keys(nextKnowledge).length > 0) {
    nextProject.knowledge = nextKnowledge;
  } else {
    delete nextProject.knowledge;
  }

  nextConfig.project = nextProject;
  return nextConfig as PaseoConfigRaw;
}
