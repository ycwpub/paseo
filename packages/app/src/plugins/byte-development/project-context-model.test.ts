import { describe, expect, it } from "vitest";
import { buildByteDevelopmentFixedFormValues } from "./project-context-model";

describe("byte development project context", () => {
  it("injects the selected Project id and repository", () => {
    expect(
      buildByteDevelopmentFixedFormValues({
        projectId: "project-1",
        repositoryPath: "/workspace/project-1",
      }),
    ).toEqual({
      projectId: "project-1",
      repository_path: "/workspace/project-1",
    });
  });

  it("does not create runnable values without a Project directory", () => {
    expect(
      buildByteDevelopmentFixedFormValues({
        projectId: "project-1",
        repositoryPath: null,
      }),
    ).toEqual({});
  });
});
