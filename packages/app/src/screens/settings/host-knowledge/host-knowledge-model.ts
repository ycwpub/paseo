import type { PaseoHostKnowledge } from "@getpaseo/protocol/messages";
import {
  projectKnowledgeDraftError,
  projectKnowledgeDraftToConfig,
  projectKnowledgeToDraft,
  type ProjectKnowledgeDraft,
} from "@/projects/knowledge/model";

export function hostKnowledgeToDraft(
  knowledge: PaseoHostKnowledge | null | undefined,
): ProjectKnowledgeDraft {
  return projectKnowledgeToDraft({
    knowledge: {
      general: knowledge?.general ?? [],
      standards: knowledge?.standards ?? [],
      projectSpecific: [],
    },
  });
}

export function hostKnowledgeDraftToConfig(draft: ProjectKnowledgeDraft): PaseoHostKnowledge {
  const knowledge = projectKnowledgeDraftToConfig(draft);
  return {
    general: knowledge?.general ?? [],
    standards: knowledge?.standards ?? [],
  };
}

export function hostKnowledgeDraftError(draft: ProjectKnowledgeDraft): string | null {
  return projectKnowledgeDraftError({
    ...draft,
    projectSpecific: [],
  });
}
