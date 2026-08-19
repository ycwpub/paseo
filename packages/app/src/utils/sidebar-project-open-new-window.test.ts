import { describe, expect, it } from "vitest";
import { resolveSidebarProjectOpenNewWindowOptions } from "./sidebar-project-open-new-window";

describe("resolveSidebarProjectOpenNewWindowOptions", () => {
  it("uses the existing path flow for a directory-backed Project", () => {
    expect(
      resolveSidebarProjectOpenNewWindowOptions({
        projectPath: " /repo/paseo ",
        displayName: "Paseo",
        target: { serverId: "host-a", projectId: "project-a" },
      }),
    ).toEqual({ pendingOpenProjectPath: "/repo/paseo" });
  });

  it("opens a directoryless Project in the new Workspace screen by identity", () => {
    expect(
      resolveSidebarProjectOpenNewWindowOptions({
        projectPath: "",
        displayName: "Planning / Notes",
        target: { serverId: "host-a", projectId: "project-a" },
      }),
    ).toEqual({
      initialRoute: "/new?serverId=host-a&name=Planning+%2F+Notes&projectId=project-a",
    });
  });

  it("returns null when neither a path nor Project identity is available", () => {
    expect(
      resolveSidebarProjectOpenNewWindowOptions({
        projectPath: "",
        displayName: "Planning",
        target: null,
      }),
    ).toBeNull();
  });
});
