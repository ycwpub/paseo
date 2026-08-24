import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveMemoryScopePaths } from "./memory-scope-paths.js";

describe("resolveMemoryScopePaths", () => {
  const paseoHome = "/tmp/paseo-home";

  test("keeps global memory under the global memory directory", () => {
    expect(
      resolveMemoryScopePaths({
        paseoHome,
        scope: { type: "global", id: "user-1" },
      }).summaryPath,
    ).toBe(path.join(paseoHome, "memory", "users", "user-1", "summary.md"));
  });

  test("resolves Project storage and the legacy Workspace migration path", () => {
    expect(
      resolveMemoryScopePaths({
        paseoHome,
        scope: { type: "project", id: "project-1" },
      }).detailsPath,
    ).toBe(path.join(paseoHome, "projects", "project-1", "memory", "details"));
    expect(
      resolveMemoryScopePaths({
        paseoHome,
        scope: { type: "workspace", id: "workspace-1" },
        workspaceProjectId: "project-1",
      }).detailsPath,
    ).toBe(
      path.join(
        paseoHome,
        "projects",
        "project-1",
        "workspaces",
        "workspace-1",
        "memory",
        "details",
      ),
    );
  });

  test("stores Assistant memory under the Assistant directory", () => {
    expect(
      resolveMemoryScopePaths({
        paseoHome,
        scope: { type: "assistant", id: "assistant-1" },
      }).summaryPath,
    ).toBe(path.join(paseoHome, "assistants", "assistant-1", "memory", "learned", "summary.md"));
  });

  test("requires the parent Project for Workspace storage", () => {
    expect(() =>
      resolveMemoryScopePaths({
        paseoHome,
        scope: { type: "workspace", id: "workspace-1" },
      }),
    ).toThrow("requires its Project ID");
  });
});
