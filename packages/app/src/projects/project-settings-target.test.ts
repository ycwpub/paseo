import { describe, expect, it } from "vitest";
import type { ProjectHostEntry } from "@/utils/projects";
import { resolveProjectSettingsTarget } from "./project-settings-target";

function host(overrides: Partial<ProjectHostEntry> = {}): ProjectHostEntry {
  return {
    serverId: "host-a",
    projectId: "project-a",
    projectName: "Project A",
    projectCustomName: null,
    serverName: "Host A",
    isOnline: true,
    projectPath: "/projects/a",
    repoRoot: "/projects/a",
    isDirectoryless: false,
    workspaceCount: 0,
    workspaces: [],
    ...overrides,
  };
}

describe("resolveProjectSettingsTarget", () => {
  it("opens all settings for a directory-backed Project", () => {
    expect(resolveProjectSettingsTarget(host())).toEqual({
      kind: "directory-backed",
      host: host(),
    });
  });

  it("opens Project-level settings when a blank Project has no directory", () => {
    const blankProject = host({ repoRoot: "", isDirectoryless: true });

    expect(resolveProjectSettingsTarget(blankProject)).toEqual({
      kind: "directoryless",
      host: blankProject,
    });
  });

  it("opens directory-backed settings as soon as a blank Project gains a directory", () => {
    const attachedProject = host({
      repoRoot: "/projects/attached",
      isDirectoryless: true,
    });

    expect(resolveProjectSettingsTarget(attachedProject)).toEqual({
      kind: "directory-backed",
      host: attachedProject,
    });
  });

  it("rejects a missing root that is not an intentional blank Project", () => {
    expect(resolveProjectSettingsTarget(host({ repoRoot: "" }))).toEqual({
      kind: "unavailable",
    });
  });

  it("rejects an offline blank Project", () => {
    expect(
      resolveProjectSettingsTarget(host({ repoRoot: "", isDirectoryless: true, isOnline: false })),
    ).toEqual({ kind: "unavailable" });
  });
});
