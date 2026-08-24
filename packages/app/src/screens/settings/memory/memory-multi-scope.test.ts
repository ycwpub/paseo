import { describe, expect, test } from "vitest";
import { formatAdditionalMemoryScopes, parseMemoryScopes } from "./memory-multi-scope";

describe("memory multi-scope helpers", () => {
  test("parses and deduplicates multiple scopes", () => {
    expect(
      parseMemoryScopes({
        primary: { type: "project", id: "project-1" },
        additional: "assistant:assistant-1, global, project:project-1",
        globalUserId: "user-1",
      }),
    ).toEqual([
      { type: "project", id: "project-1" },
      { type: "assistant", id: "assistant-1" },
      { type: "global", id: "user-1" },
    ]);
  });

  test("rejects the removed Workspace memory scope", () => {
    expect(() =>
      parseMemoryScopes({
        primary: { type: "project", id: "project-1" },
        additional: "workspace:workspace-1",
        globalUserId: "user-1",
      }),
    ).toThrow("Workspace 记忆已移除，请选择所属 Project。");
  });

  test("formats scopes after the primary scope", () => {
    expect(
      formatAdditionalMemoryScopes({
        scope: { type: "project", id: "project-1" },
        scopes: [
          { type: "project", id: "project-1" },
          { type: "assistant", id: "assistant-1" },
          { type: "global", id: "user-1" },
        ],
      }),
    ).toBe("assistant:assistant-1, global");
  });
});
