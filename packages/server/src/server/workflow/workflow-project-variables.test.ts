import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkflowProjectVariables } from "./workflow-project-variables.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("resolveWorkflowProjectVariables", () => {
  it("loads variables from the most specific active Project containing the Agent cwd", async () => {
    const home = await mkdtemp(join(tmpdir(), "paseo-workflow-project-"));
    tempDirs.push(home);
    const projectRoot = join(home, "project");
    const nestedProjectRoot = join(projectRoot, "services", "checkout");
    const cwd = join(nestedProjectRoot, "src");
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(projectRoot, "paseo.json"),
      JSON.stringify({ project: { variables: { serviceName: "root" } } }),
    );
    await writeFile(
      join(nestedProjectRoot, "paseo.json"),
      JSON.stringify({
        project: {
          variables: {
            serviceName: "checkout",
            owner: "payments",
          },
        },
      }),
    );

    const variables = await resolveWorkflowProjectVariables({
      cwd,
      projectRegistry: {
        list: async () =>
          [
            {
              projectId: "root",
              rootPath: projectRoot,
              archivedAt: null,
            },
            {
              projectId: "checkout",
              rootPath: nestedProjectRoot,
              archivedAt: null,
            },
          ] as never,
      },
    });

    expect(variables).toEqual({
      serviceName: "checkout",
      owner: "payments",
    });
  });

  it("falls back to the Agent cwd when it is not registered yet", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "paseo-workflow-project-"));
    tempDirs.push(projectRoot);
    await writeFile(
      join(projectRoot, "paseo.json"),
      JSON.stringify({ project: { variables: { environment: "test" } } }),
    );

    await expect(
      resolveWorkflowProjectVariables({
        cwd: projectRoot,
        projectRegistry: { list: async () => [] },
      }),
    ).resolves.toEqual({ environment: "test" });
  });
});
