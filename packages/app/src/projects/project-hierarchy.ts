export interface ProjectHierarchyItem {
  viewKey: string;
  parentViewKey?: string | null;
}

export function flattenProjectHierarchy<T extends ProjectHierarchyItem>(
  projects: readonly T[],
): (T & { hierarchyDepth: number })[] {
  const projectByKey = new Map(projects.map((project) => [project.viewKey, project]));
  const childrenByParent = new Map<string, T[]>();
  const roots: T[] = [];

  for (const project of projects) {
    if (
      !project.parentViewKey ||
      project.parentViewKey === project.viewKey ||
      !projectByKey.has(project.parentViewKey)
    ) {
      roots.push(project);
      continue;
    }
    const siblings = childrenByParent.get(project.parentViewKey) ?? [];
    siblings.push(project);
    childrenByParent.set(project.parentViewKey, siblings);
  }

  const result: (T & { hierarchyDepth: number })[] = [];
  const visited = new Set<string>();
  const append = (project: T, depth: number) => {
    if (visited.has(project.viewKey)) return;
    visited.add(project.viewKey);
    result.push({ ...project, hierarchyDepth: depth });
    for (const child of childrenByParent.get(project.viewKey) ?? []) {
      append(child, depth + 1);
    }
  };

  for (const root of roots) append(root, 0);
  for (const project of projects) append(project, 0);
  return result;
}

/**
 * Returns the rendered Project hierarchy.
 *
 * A collapsed Project remains visible, but all of its descendant Projects are
 * omitted until it is expanded again. Descendants keep their own collapsed
 * state, so expanding the parent restores the hierarchy without changing any
 * child preference.
 */
export function flattenVisibleProjectHierarchy<T extends ProjectHierarchyItem>(
  projects: readonly T[],
  collapsedProjectKeys: ReadonlySet<string>,
): (T & { hierarchyDepth: number })[] {
  const flattened = flattenProjectHierarchy(projects);
  const hiddenParentKeys = new Set<string>();

  return flattened.filter((project) => {
    if (project.parentViewKey && hiddenParentKeys.has(project.parentViewKey)) {
      hiddenParentKeys.add(project.viewKey);
      return false;
    }
    if (collapsedProjectKeys.has(project.viewKey)) {
      hiddenParentKeys.add(project.viewKey);
    }
    return true;
  });
}
