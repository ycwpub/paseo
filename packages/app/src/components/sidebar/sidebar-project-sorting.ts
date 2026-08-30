import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";

export function sortSidebarProjectsByName(
  projects: readonly SidebarProjectEntry[],
): SidebarProjectEntry[] {
  return [...projects].sort(
    (left, right) =>
      left.projectName.localeCompare(right.projectName, undefined, {
        numeric: true,
        sensitivity: "base",
      }) || left.viewKey.localeCompare(right.viewKey),
  );
}
