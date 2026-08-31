import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  buildSidebarProjectRowModel,
  type SidebarProjectHostTarget,
  type SidebarProjectRowModel,
} from "./sidebar-project-row-model";

const EMPTY_MULTIPLICITY_MAP: ReadonlyMap<string, boolean> = new Map();

/**
 * Extends the stable row model with directoryless and managed-source Project
 * support without duplicating the base icon and row projection.
 */
export function buildFeatureSidebarProjectRowModel(input: {
  project: SidebarProjectEntry;
  collapsed: boolean;
  supportsMultiplicityByServerId?: ReadonlyMap<string, boolean>;
}): SidebarProjectRowModel {
  const base = buildSidebarProjectRowModel(input);
  const supportsMultiplicityByServerId =
    input.supportsMultiplicityByServerId ?? EMPTY_MULTIPLICITY_MAP;

  for (const host of input.project.hosts) {
    const supportsMultiplicity = supportsMultiplicityByServerId.get(host.serverId) === true;
    if (host.worktreeSupport === "unsupported" && !supportsMultiplicity) {
      continue;
    }
    const sourceDirectory = host.sourceDirectory?.trim() || host.iconWorkingDir.trim();
    if (!sourceDirectory && !supportsMultiplicity) {
      continue;
    }
    if (!host.serverId.trim() || !host.projectId.trim()) {
      continue;
    }
    const target: SidebarProjectHostTarget = {
      serverId: host.serverId,
      projectId: host.projectId,
      iconWorkingDir: sourceDirectory,
      customIconRevision: host.customIconRevision,
    };
    return {
      ...base,
      trailingAction: { kind: "new_workspace", target },
    };
  }

  return base;
}
