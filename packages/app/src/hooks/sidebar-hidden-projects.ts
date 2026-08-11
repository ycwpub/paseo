import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";

export interface HiddenSidebarProjectGroups {
  visibleProjects: SidebarProjectEntry[];
  hiddenProjects: SidebarProjectEntry[];
}

export function splitHiddenSidebarProjects(
  projects: SidebarProjectEntry[],
  hiddenProjectKeys: ReadonlySet<string>,
): HiddenSidebarProjectGroups {
  if (hiddenProjectKeys.size === 0) {
    return { visibleProjects: projects, hiddenProjects: [] };
  }

  const visibleProjects: SidebarProjectEntry[] = [];
  const hiddenProjects: SidebarProjectEntry[] = [];
  for (const project of projects) {
    if (hiddenProjectKeys.has(project.viewKey)) {
      hiddenProjects.push(project);
    } else {
      visibleProjects.push(project);
    }
  }
  return { visibleProjects, hiddenProjects };
}
