import type { ProjectHostEntry } from "@/utils/projects";

export type ProjectSettingsTarget =
  | { kind: "unavailable" }
  | { kind: "directoryless"; host: ProjectHostEntry }
  | { kind: "directory-backed"; host: ProjectHostEntry };

export function resolveProjectSettingsTarget(
  host: ProjectHostEntry | undefined,
): ProjectSettingsTarget {
  if (!host || !host.isOnline || host.serverId.trim().length === 0) {
    return { kind: "unavailable" };
  }
  if (host.repoRoot.trim().length > 0) {
    return { kind: "directory-backed", host };
  }
  if (host.isDirectoryless) {
    return { kind: "directoryless", host };
  }
  return { kind: "unavailable" };
}
