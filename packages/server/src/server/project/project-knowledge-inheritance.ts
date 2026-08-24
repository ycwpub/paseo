import type { ResolvedProjectKnowledge } from "./project-knowledge-context.js";

export function mergeProjectKnowledge(
  layers: readonly ResolvedProjectKnowledge[],
): ResolvedProjectKnowledge {
  return {
    general: {
      localDocuments: unique(layers.flatMap((layer) => layer.general.localDocuments)),
      cloudDocuments: uniqueDocuments(layers.flatMap((layer) => layer.general.cloudDocuments)),
    },
    standards: {
      localDocuments: uniqueDocuments(layers.flatMap((layer) => layer.standards.localDocuments)),
      cloudDocuments: uniqueDocuments(layers.flatMap((layer) => layer.standards.cloudDocuments)),
    },
    projectSpecific: {
      localDocuments: uniqueDocuments(
        layers.flatMap((layer) => layer.projectSpecific.localDocuments),
      ),
      cloudDocuments: uniqueDocuments(
        layers.flatMap((layer) => layer.projectSpecific.cloudDocuments),
      ),
    },
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueDocuments<T extends { source: string; resolvedSource: string }>(
  documents: readonly T[],
): T[] {
  const byIdentity = new Map<string, T>();
  for (const document of documents) {
    byIdentity.set(`${document.source}\0${document.resolvedSource}`, document);
  }
  return [...byIdentity.values()];
}
