import { describe, expect, test } from "vitest";
import { findLarkProjectIdByCwd } from "./lark-project-binding";

describe("Lark Project binding identity", () => {
  test("resolves the host-local Project ID for the selected managed directory", () => {
    expect(
      findLarkProjectIdByCwd(
        [
          {
            hosts: [
              {
                serverId: "server-1",
                projectId: "prj_finance",
                repoRoot: "/Users/test/.paseo/projects/prj_finance",
              },
            ],
          },
        ],
        "server-1",
        "/Users/test/.paseo/projects/prj_finance",
      ),
    ).toBe("prj_finance");
  });

  test("does not reuse a Project ID from another Host", () => {
    expect(
      findLarkProjectIdByCwd(
        [
          {
            hosts: [
              {
                serverId: "server-2",
                projectId: "prj_remote",
                repoRoot: "/repo/shared",
              },
            ],
          },
        ],
        "server-1",
        "/repo/shared",
      ),
    ).toBeNull();
  });

  test("prefers the directoryless Project identity over a duplicate path-based Project", () => {
    expect(
      findLarkProjectIdByCwd(
        [
          {
            hosts: [
              {
                serverId: "server-1",
                projectId: "prj_duplicate",
                repoRoot: "/Users/test/.paseo/projects/prj_f60e7008273e6eea",
              },
            ],
          },
          {
            hosts: [
              {
                serverId: "server-1",
                projectId: "prj_f60e7008273e6eea",
                repoRoot: "/Users/test/.paseo/projects/prj_f60e7008273e6eea",
              },
            ],
          },
        ],
        "server-1",
        "/Users/test/.paseo/projects/prj_f60e7008273e6eea",
      ),
    ).toBe("prj_f60e7008273e6eea");
  });
});
