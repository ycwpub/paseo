import { describe, expect, test } from "vitest";
import { resolveLarkTargetProjectId } from "./lark-project-target.js";

describe("resolveLarkTargetProjectId", () => {
  test("uses the explicitly persisted Project identity", () => {
    expect(
      resolveLarkTargetProjectId(
        {
          kind: "workspace",
          provider: "claude",
          cwd: "/tmp/paseo/projects/prj_directory",
          workspaceId: null,
          projectId: "prj_named_project",
        },
        "/tmp/paseo",
      ),
    ).toBe("prj_named_project");
  });

  test("recovers the Project identity from a legacy managed Project path", () => {
    expect(
      resolveLarkTargetProjectId(
        {
          kind: "workspace",
          provider: "claude",
          cwd: "/tmp/paseo/projects/prj_f60e7008273e6eea",
          workspaceId: null,
        },
        "/tmp/paseo",
      ),
    ).toBe("prj_f60e7008273e6eea");
  });

  test("does not infer Project ownership from an ordinary directory", () => {
    expect(
      resolveLarkTargetProjectId(
        {
          kind: "workspace",
          provider: "claude",
          cwd: "/repo/prj_f60e7008273e6eea",
          workspaceId: null,
        },
        "/tmp/paseo",
      ),
    ).toBeUndefined();
  });
});
